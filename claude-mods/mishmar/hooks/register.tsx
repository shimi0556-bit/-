// משמר (mishmar): a Hebrew session dashboard plus a guard against dangerous
// tool calls. Everything the drawings read lives in $.state, so a hot reload
// keeps the numbers; the guard turns itself back on in every new session.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallInput, ToolCallResult } from 'claude-code'

import type { MishmarEvent, MishmarFile, MishmarStats } from '../types'
import { checkCommand, checkPath } from './guard'
import type { Verdict } from './guard'

const PANE = 'mishmar'
const TITLE = 'משמר'
const KEEP_EVENTS = 20
const KEEP_FILES = 50

const EMPTY: MishmarStats = {
  startedAt: 0,
  turns: 0,
  lastTurnSeconds: null,
  tools: {},
  files: [],
  errors: 0,
  blocked: 0,
  warned: 0,
  events: [],
}

const stats = atom({ plugin: 'mishmar', key: 'stats' } as const, EMPTY)
const isGuardOn = atom({ plugin: 'mishmar', key: 'isGuardOn' } as const, true)
const isBandHidden = atom({ plugin: 'mishmar', key: 'isBandHidden' } as const, false)

/** Origins that are the person themself: only they may switch the guard off. */
const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

const HELP = [
  'משמר — לוח בקרה ושומר בטיחות',
  '/mishmar         פותח את הלוח',
  '/mishmar off     מכבה את השומר לסשן הזה (גם: כבה)',
  '/mishmar on      מפעיל את השומר מחדש (גם: הפעל)',
  '/mishmar reset   מאפס את הסטטיסטיקה (גם: אפס)',
].join('\n')

// ---------- reading a tool call ----------

function editedPath(e: ToolCallInput): string | undefined {
  if (e.tool === 'Edit' || e.tool === 'Write') return e.file_path
  if (e.tool === 'NotebookEdit') return e.notebook_path
  return undefined
}

function judge(e: ToolCallInput): { verdict: Verdict; what: string } | null {
  if (e.tool === 'Bash') {
    const verdict = checkCommand(e.command)
    return verdict && { verdict, what: e.command }
  }
  const path = editedPath(e)
  if (path === undefined) return null
  const verdict = checkPath(path)
  return verdict && { verdict, what: path }
}

const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

// ---------- updating the numbers ----------

function withEvent(s: MishmarStats, event: MishmarEvent): MishmarStats {
  return {
    ...s,
    startedAt: s.startedAt || event.at,
    blocked: s.blocked + (event.level === 'block' ? 1 : 0),
    warned: s.warned + (event.level === 'warn' ? 1 : 0),
    events: [...s.events, event].slice(-KEEP_EVENTS),
  }
}

function withCall(s: MishmarStats, e: ToolCallInput, ran: ToolCallResult, now: number): MishmarStats {
  if (ran.deny !== undefined) return s
  const path = editedPath(e)
  let files: MishmarFile[] = s.files
  if (path !== undefined && ran.isError !== true) {
    const before = files.find(f => f.path === path)
    files = [...files.filter(f => f.path !== path), { path, edits: (before?.edits ?? 0) + 1 }].slice(
      -KEEP_FILES,
    )
  }
  return {
    ...s,
    startedAt: s.startedAt || now,
    tools: { ...s.tools, [e.tool]: (s.tools[e.tool] ?? 0) + 1 },
    files,
    errors: s.errors + (ran.isError === true ? 1 : 0),
  }
}

async function showStatus($: EngineInterface) {
  const s = await read($, stats)
  const parts = [(await read($, isGuardOn)) ? '🛡️ משמר פעיל' : '🛡️ משמר כבוי (‎/mishmar on‎)']
  if (s.blocked > 0) parts.push(`⛔ ${s.blocked}`)
  if (s.warned > 0) parts.push(`⚠️ ${s.warned}`)
  $.ui.status(parts.join(' · '))
}

// ---------- formatting ----------

function sinceStart(s: MishmarStats, now: number): string {
  if (s.startedAt === 0) return 'רגע'
  const minutes = Math.floor((now - s.startedAt) / 60_000)
  if (minutes < 1) return 'פחות מדקה'
  if (minutes < 60) return `${minutes} דק׳`
  return `${Math.floor(minutes / 60)} שע׳ ${minutes % 60} דק׳`
}

const totalCalls = (s: MishmarStats) => Object.values(s.tools).reduce((sum, n) => sum + n, 0)

const shortPath = (path: string, cwd: string) =>
  path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path

function summary(s: MishmarStats, isOn: boolean): string {
  return [
    isOn ? '🛡️ השומר פעיל' : '🛡️ השומר כבוי',
    `${totalCalls(s)} קריאות לכלים`,
    `${s.files.length} קבצים נערכו`,
    `⛔ ${s.blocked} חסימות`,
    `⚠️ ${s.warned} אזהרות`,
  ].join(' · ')
}

/** The whole dashboard as plain lines: what `/mishmar` prints, readable on every surface. */
function report(s: MishmarStats, isOn: boolean, now: number, cwd: string): string {
  const lines = [summary(s, isOn)]
  const turn = s.lastTurnSeconds === null ? '' : ` · תור אחרון ${s.lastTurnSeconds} שנ׳`
  lines.push(`⏱ ${sinceStart(s, now)} בסשן · ${s.turns} תורות${turn}`)

  const tools = Object.entries(s.tools).sort((a, b) => b[1] - a[1])
  if (tools.length > 0) {
    lines.push('', `כלים: ${tools.slice(0, 8).map(([name, n]) => `${name} ${n}`).join(' · ')}`)
  }
  const files = s.files.slice(-5).reverse()
  if (files.length > 0) {
    lines.push('', 'קבצים אחרונים שנערכו:', ...files.map(f => `  ✏️ ${f.edits}× ${shortPath(f.path, cwd)}`))
  }
  const events = s.events.slice(-5).reverse()
  if (events.length > 0) {
    lines.push(
      '',
      'חסימות ואזהרות אחרונות:',
      ...events.map(e => `  ${e.level === 'block' ? '⛔' : '⚠️'} ${e.tool}: ${oneLine(e.what, 60)} — ${e.reason}`),
    )
  }
  return lines.join('\n')
}

const SURFACE_NAMES: Record<string, string> = {
  terminal: 'טרמינל',
  desktop: 'אפליקציית דסקטופ',
  mobile: 'אפליקציית מובייל',
  vscode: 'VS Code',
}

// ---------- the mod ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mishmar',
      description: 'משמר: לוח בקרה של הסשן ושומר בטיחות (on / off / reset)',
      argumentHint: '[on|off|reset|help]',
    })
    const now = await $.clock.now()
    await update($, stats, s => (s.startedAt === 0 ? { ...s, startedAt: now } : s))
    await showStatus($)
    // Redraw once a minute so the session clock in the pane and band moves.
    $.clock.every(60_000, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const found = (await read($, isGuardOn)) ? judge(e) : null

    if (found !== null) {
      const { verdict, what } = found
      const event: MishmarEvent = {
        at: await $.clock.now(),
        level: verdict.level,
        tool: e.tool,
        what: oneLine(what, 120),
        reason: verdict.reason,
      }
      await update($, stats, s => withEvent(s, event))
      await showStatus($)

      if (verdict.level === 'block') {
        $.ui.toast(`⛔ משמר חסם: ${verdict.reason}`, { timeoutMs: 8000 })
        return {
          deny:
            `משמר (mishmar) חסם את הפעולה: ${verdict.reason}. ` +
            'אל תנסה לעקוף את החסימה בדרך אחרת. אם הפעולה באמת נחוצה, הסבר למשתמש למה, ' +
            'ובקש שיבצע אותה בעצמו או יכבה את השומר עם ‎/mishmar off‎.',
        }
      }
      $.ui.toast(`⚠️ משמר: ${verdict.reason}`, { timeoutMs: 6000 })
    }

    const ran = await next(e)
    const now = await $.clock.now()
    await update($, stats, s => withCall(s, e, ran, now))

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const seconds = Math.round(e.durationMs / 1000)
      await update($, stats, s => ({ ...s, turns: s.turns + 1, lastTurnSeconds: seconds }))
    }

    return next(e)
  })

  on('command.run', { command: 'mishmar' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isPerson = PERSON_ORIGINS.has(e.origin.kind)

    if (arg === 'off' || arg === 'כבה') {
      if (!isPerson) return { text: 'משמר: רק המשתמש יכול לכבות את השומר.' }
      await update($, isGuardOn, () => false)
      await showStatus($)
      return { text: '🛡️ השומר כבוי לסשן הזה. ‎/mishmar on‎ מחזיר אותו (וגם סשן חדש).' }
    }
    if (arg === 'on' || arg === 'הפעל') {
      await update($, isGuardOn, () => true)
      await showStatus($)
      return { text: '🛡️ השומר פעיל.' }
    }
    if (arg === 'reset' || arg === 'אפס') {
      const now = await $.clock.now()
      await update($, stats, () => ({ ...EMPTY, startedAt: now }))
      await update($, isBandHidden, () => false)
      await showStatus($)
      return { text: 'משמר: הסטטיסטיקה אופסה.' }
    }
    if (arg === 'help' || arg === 'עזרה') return { text: HELP }
    if (arg !== '') return { text: `משמר: לא מכיר את "${arg}".\n${HELP}` }

    const opened = await $.ui.open({ id: PANE, title: TITLE })
    const s = await read($, stats)
    const text = report(s, await read($, isGuardOn), await $.clock.now(), await $.session.cwd())
    const surfaces = (await $.session.surfaces()).map(name => SURFACE_NAMES[name] ?? name)
    const where = opened.isPlaced
      ? `הלוח המלא נפתח כפאנל ב: ${surfaces.join(', ') || 'אין מסך מחובר'}`
      : `הלוח ממתין: ${opened.reason}`
    return { text: `${text}\n\n(${where})` }
  })

  // The band above the prompt: one line of totals, once something has happened.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, stats)
    const calls = totalCalls(s)
    const isQuiet =
      e.props.hasSurvey || (await read($, isBandHidden)) || (calls === 0 && s.events.length === 0)
    if (isQuiet) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const isOn = await read($, isGuardOn)
    const now = await $.clock.now()

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={isOn ? 'success' : 'warning'}>🛡️</Text>
        <Text dimColor>
          {sinceStart(s, now)} · {calls} כלים · {s.files.length} קבצים
        </Text>
        {s.blocked > 0 && <Text color="error">⛔ {s.blocked}</Text>}
        {s.warned > 0 && <Text color="warning">⚠️ {s.warned}</Text>}
        <Button key="open" label="לוח" hotkey="l" onPress={() => $.ui.open({ id: PANE, title: TITLE })} />
        <Button key="hide" label="הסתר" dimColor onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })

  // The pane: the whole dashboard.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, stats)
    const isOn = await read($, isGuardOn)
    const now = await $.clock.now()
    const cwd = await $.session.cwd()
    const width = Math.max(24, e.props.bodyColumns)

    const tools = Object.entries(s.tools)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
    const most = tools[0]?.[1] ?? 1
    const nameWidth = Math.min(22, Math.max(4, ...tools.map(([name]) => name.length)))
    const barRoom = Math.max(4, width - nameWidth - 8)
    const files = s.files.slice(-8).reverse()
    const events = s.events.slice(-6).reverse()

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold color={isOn ? 'success' : 'warning'}>
            {isOn ? '🛡️ השומר פעיל' : '🛡️ השומר כבוי'}
          </Text>
          <Button
            key="guard"
            label={isOn ? 'כבה שומר' : 'הפעל שומר'}
            hotkey="g"
            onPress={async () => {
              await update($, isGuardOn, wasOn => !wasOn)
              await showStatus($)
            }}
          />
        </Box>
        <Text dimColor>
          ⏱ {sinceStart(s, now)} בסשן · {s.turns} תורות
          {s.lastTurnSeconds === null ? '' : ` · תור אחרון ${s.lastTurnSeconds} שנ׳`}
          {s.errors > 0 ? ` · ${s.errors} שגיאות` : ''}
        </Text>

        <Box marginTop={1}>
          <Text bold>כלים ({totalCalls(s)})</Text>
        </Box>
        {tools.length === 0 && <Text dimColor>עוד לא רץ אף כלי.</Text>}
        {tools.map(([name, count]) => (
          <Box key={`tool-${name}`} flexDirection="row" gap={1}>
            <Box width={nameWidth}>
              <Text wrap="truncate-end">{name}</Text>
            </Box>
            <Text color="suggestion">{'█'.repeat(Math.max(1, Math.round((count / most) * barRoom)))}</Text>
            <Text>{count}</Text>
          </Box>
        ))}

        <Box marginTop={1}>
          <Text bold>קבצים שנערכו ({s.files.length})</Text>
        </Box>
        {files.length === 0 && <Text dimColor>עוד לא נערך אף קובץ.</Text>}
        {files.map(file => (
          <Text wrap="truncate-start">
            ✏️ {file.edits}× {shortPath(file.path, cwd)}
          </Text>
        ))}

        <Box marginTop={1}>
          <Text bold>
            חסימות ואזהרות (⛔ {s.blocked} · ⚠️ {s.warned})
          </Text>
        </Box>
        {events.length === 0 && <Text dimColor>שקט. לא נחסם כלום.</Text>}
        {events.map((event, i) => (
          <Box key={`event-${s.events.length - i}`} flexDirection="column">
            <Text color={event.level === 'block' ? 'error' : 'warning'} wrap="truncate-end">
              {event.level === 'block' ? '⛔' : '⚠️'} {event.tool}: {event.what}
            </Text>
            <Text dimColor wrap="wrap">
              {'   '}
              {event.reason}
            </Text>
          </Box>
        ))}

        <Box marginTop={1} flexDirection="row" gap={1}>
          <Button
            key="reset"
            label="איפוס"
            hotkey="r"
            onPress={async () => {
              const at = await $.clock.now()
              await update($, stats, () => ({ ...EMPTY, startedAt: at }))
              await showStatus($)
            }}
          />
          <Button key="close" label="סגור" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
