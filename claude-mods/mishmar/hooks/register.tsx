// משמר (mishmar): a Hebrew session dashboard, a guard against dangerous tool
// calls, and an activity log (GitHub, git, skills, plugins, subagents) that is
// mirrored to a live side panel. Everything the drawings read lives in $.state,
// so a hot reload keeps it; the guard turns itself back on in every new session.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallInput, ToolCallResult } from 'claude-code'

import type { MishmarActivity, MishmarEnv, MishmarEvent, MishmarFile, MishmarSidebar, MishmarStats } from '../types'
import { changesBranch, classify, classifyCommand } from './activity'
import { checkCommand, checkPath } from './guard'
import type { Verdict } from './guard'
import type { Activity } from './activity'
import { CONFIG_PATH, newActivity, parseSidebarUrl, repoName, sessionUrlFrom, versionFrom } from './sidebar'

const PANE = 'mishmar'
const TITLE = 'משמר'
const KEEP_EVENTS = 20
const KEEP_FILES = 50
const KEEP_ACTIVITY = 100
const KEEP_OUTBOX = 500
const BATCH = 50

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
const activity = atom({ plugin: 'mishmar', key: 'activity' } as const, [])
/** Log lines not yet written to the side panel, oldest first. */
const outbox = atom({ plugin: 'mishmar', key: 'outbox' } as const, [])
const env = atom({ plugin: 'mishmar', key: 'env' } as const, null)
const isEnvDirty = atom({ plugin: 'mishmar', key: 'isEnvDirty' } as const, false)
const sidebar = atom({ plugin: 'mishmar', key: 'sidebar' } as const, { url: null, error: null, synced: 0 })

/** Origins that are the person themself: only they may switch the guard off. */
const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

const HELP = [
  'משמר — לוח בקרה ושומר בטיחות',
  '/mishmar         פותח את הלוח',
  '/mishmar off     מכבה את השומר לסשן הזה (גם: כבה)',
  '/mishmar on      מפעיל את השומר מחדש (גם: הפעל)',
  '/mishmar reset   מאפס את הסטטיסטיקה (גם: אפס)',
  '/mishmar sidebar  הקישור לסרגל הצדדי, ומנסה שוב אם נעצר (גם: סרגל)',
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

// ---------- the environment and the side panel ----------

/** The side panel's address from `~/.claude/mishmar.json`, or null. */
async function readSidebarUrl($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME')
  if (home === undefined || home === '') return null
  try {
    return parseSidebarUrl(await $.fs.read(`${home}/${CONFIG_PATH}`))
  } catch {
    return null
  }
}

async function git($: EngineInterface, args: string[]): Promise<string> {
  try {
    const ran = await $.process.run(['git', ...args])
    return ran.exitCode === 0 ? ran.stdout.trim() : ''
  } catch {
    return ''
  }
}

async function collectEnv($: EngineInterface, cwd: string, startedAt: number): Promise<MishmarEnv> {
  const [isRemote, envType, entrypoint, remoteId] = await Promise.all([
    $.env.get('CLAUDE_CODE_REMOTE'),
    $.env.get('CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE'),
    $.env.get('CLAUDE_CODE_ENTRYPOINT'),
    $.env.get('CLAUDE_CODE_REMOTE_SESSION_ID'),
  ])
  const [sessionId, version, surfaces, branch, remote] = await Promise.all([
    $.session.id(),
    $.session.version(),
    $.session.surfaces(),
    git($, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git($, ['remote', 'get-url', 'origin']),
  ])
  return {
    sessionId,
    kind: isRemote === 'true' ? 'cloud' : 'local',
    envType: envType ?? '',
    entrypoint: entrypoint ?? '',
    version: version.version,
    cwd,
    repo: repoName(remote),
    branch,
    sessionUrl: sessionUrlFrom(remoteId),
    surfaces: [...surfaces],
    startedAt,
  }
}

/** Re-reads the branch after a checkout or switch; marks the environment for the side panel. */
async function refreshBranch($: EngineInterface) {
  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const before = await read($, env)
  if (before === null || branch === '' || branch === before.branch) return
  await update($, env, current => (current === null ? current : { ...current, branch }))
  await update($, isEnvDirty, () => true)
}

async function logActivity($: EngineInterface, act: Activity, status: MishmarActivity['status']) {
  const entry = newActivity(act, status, await $.clock.now())
  await update($, activity, list => [...list, entry].slice(-KEEP_ACTIVITY))
  await update($, outbox, list => [...list, entry].slice(-KEEP_OUTBOX))
}

/** The tool's text, or throws its refusal or error so mirroring stops and says why. */
function ensureOk(ran: ToolCallResult): string {
  if (ran.deny !== undefined) throw new Error(ran.deny)
  if (ran.isError === true) throw new Error(ran.text ?? 'ArtifactData נכשל')
  return ran.text ?? ''
}

async function writeEnv($: EngineInterface, url: string, current: MishmarEnv) {
  const got = ensureOk(
    await $.tool.call({ tool: 'ArtifactData', action: 'get', url, collection: 'sessions', doc_id: current.sessionId }),
  )
  const version = versionFrom(got)
  ensureOk(
    await $.tool.call({
      tool: 'ArtifactData',
      action: 'set',
      url,
      collection: 'sessions',
      doc_id: current.sessionId,
      data: { ...current },
      ...(version === undefined ? {} : { if_version: version }),
    }),
  )
}

let isFlushing = false

/** Sends the environment (when it changed) and up to 50 queued log lines to the side panel. */
async function flush($: EngineInterface) {
  if (isFlushing) return
  const target = await read($, sidebar)
  if (target.url === null || target.error !== null) return
  const current = await read($, env)
  if (current === null) return
  isFlushing = true
  try {
    if (await read($, isEnvDirty)) {
      await writeEnv($, target.url, current)
      await update($, isEnvDirty, () => false)
    }
    const queued = (await read($, outbox)).slice(0, BATCH)
    if (queued.length === 0) return
    ensureOk(
      await $.tool.call({
        tool: 'ArtifactData',
        action: 'batch',
        url: target.url,
        writes: queued.map(entry => ({
          op: 'set' as const,
          collection: `sessions/${current.sessionId}/events`,
          doc_id: entry.id,
          data: { ...entry },
        })),
      }),
    )
    const sent = new Set(queued.map(entry => entry.id))
    await update($, outbox, list => list.filter(entry => !sent.has(entry.id)))
    await update($, sidebar, s => ({ ...s, synced: s.synced + queued.length }))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await update($, sidebar, s => ({ ...s, error: reason.slice(0, 300) }))
    $.ui.toast(`משמר: הסרגל הצדדי הפסיק להתעדכן (${reason.slice(0, 80)}). ‎/mishmar sidebar‎ מנסה שוב.`, {
      timeoutMs: 10_000,
    })
  } finally {
    isFlushing = false
  }
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
function report(s: MishmarStats, isOn: boolean, now: number, cwd: string, log: MishmarActivity[], current: MishmarEnv | null): string {
  const lines = [summary(s, isOn), envLine(current)]
  const turn = s.lastTurnSeconds === null ? '' : ` · תור אחרון ${s.lastTurnSeconds} שנ׳`
  lines.push(`⏱ ${sinceStart(s, now)} בסשן · ${s.turns} תורות${turn}`)

  const recent = log.slice(-8).reverse()
  if (recent.length > 0) lines.push('', 'פעולות אחרונות (GitHub, git, סקילים, תוספים, סוכנים):', ...recent.map(a => `  ${activityLine(a)}`))

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

const KIND_LABEL: Record<MishmarActivity['kind'], string> = {
  github: 'GitHub',
  git: 'git',
  skill: 'סקיל',
  plugin: 'תוסף',
  agent: 'סוכן',
  command: 'פקודה',
}
const STATUS_MARK: Record<MishmarActivity['status'], string> = { ok: '✓', error: '✗', denied: '⛔' }

function envLine(current: MishmarEnv | null): string {
  if (current === null) return 'סביבה: עוד לא נקראה'
  const where = current.kind === 'cloud' ? `☁️ ענן (${current.envType || 'cloud'})` : '💻 מחשב מקומי'
  return [where, current.repo, current.branch].filter(Boolean).join(' · ')
}

const clockTime = (ms: number) => {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}

const activityLine = (a: MishmarActivity) =>
  `${STATUS_MARK[a.status]} [${KIND_LABEL[a.kind]}] ${a.title}${a.isWrite ? ' (כתיבה)' : ''} · ${clockTime(a.at)}`

function sidebarLine(target: MishmarSidebar): string {
  if (target.url === null) return `סרגל צדדי: לא מוגדר (הכתובת נקראת מ-‎~/${CONFIG_PATH}‎)`
  if (target.error !== null) return `סרגל צדדי: נעצר (${target.error}). ‎/mishmar sidebar‎ מנסה שוב.\n${target.url}`
  return `סרגל צדדי: ${target.url} (${target.synced} פעולות נשלחו)`
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
      description: 'משמר: לוח בקרה, יומן פעולות ושומר בטיחות (on / off / reset / sidebar)',
      argumentHint: '[on|off|reset|sidebar|help]',
    })
    const now = await $.clock.now()
    await update($, stats, s => (s.startedAt === 0 ? { ...s, startedAt: now } : s))
    await showStatus($)

    // Where this session runs, re-read on every load (a reload keeps startedAt).
    const before = await read($, env)
    const fresh = await collectEnv($, e.cwd, before?.startedAt ?? now)
    await update($, env, () => fresh)
    await update($, isEnvDirty, () => true)
    const url = await readSidebarUrl($)
    await update($, sidebar, s => ({ ...s, url, error: null }))

    // Redraw once a minute so the session clock in the pane and band moves,
    // and send the log to the side panel every two seconds.
    $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    $.clock.every(2_000, () => void flush($))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const act = classify(e)
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
        if (act !== null) await logActivity($, act, 'denied')
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
    if (act !== null) {
      await logActivity($, act, ran.deny !== undefined ? 'denied' : ran.isError === true ? 'error' : 'ok')
    }
    if (e.tool === 'Bash' && ran.isError !== true && ran.deny === undefined && changesBranch(e.command)) {
      await refreshBranch($)
    }

    return ran
  })

  // Slash commands the person runs (skills and plugin commands among them) go in the log too.
  on('command.run', async ($, e, next) => {
    if (e.command === 'mishmar') return next(e)
    const ran = await next(e)
    await logActivity($, classifyCommand(e.command, e.args), 'ok')
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
    if (arg === 'sidebar' || arg === 'סרגל') {
      const url = await readSidebarUrl($)
      await update($, sidebar, s => ({ ...s, url, error: null }))
      await update($, isEnvDirty, () => true)
      return { text: sidebarLine(await read($, sidebar)) }
    }
    if (arg === 'help' || arg === 'עזרה') return { text: HELP }
    if (arg !== '') return { text: `משמר: לא מכיר את "${arg}".\n${HELP}` }

    const opened = await $.ui.open({ id: PANE, title: TITLE })
    const s = await read($, stats)
    const text = report(
      s,
      await read($, isGuardOn),
      await $.clock.now(),
      await $.session.cwd(),
      await read($, activity),
      await read($, env),
    )
    const surfaces = (await $.session.surfaces()).map(name => SURFACE_NAMES[name] ?? name)
    const where = opened.isPlaced
      ? `הלוח המלא נפתח כפאנל ב: ${surfaces.join(', ') || 'אין מסך מחובר'}`
      : `הלוח ממתין: ${opened.reason}`
    return { text: `${text}\n\n${sidebarLine(await read($, sidebar))}\n(${where})` }
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
    const files = s.files.slice(-6).reverse()
    const events = s.events.slice(-5).reverse()
    const current = await read($, env)
    const log = await read($, activity)
    const recent = log.slice(-8).reverse()

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
        <Text dimColor wrap="truncate-end">
          {envLine(current)}
        </Text>

        <Box marginTop={1}>
          <Text bold>יומן פעולות ({log.length})</Text>
        </Box>
        {recent.length === 0 && <Text dimColor>עוד לא היו גישות ל-GitHub, סקילים, תוספים או סוכנים.</Text>}
        {recent.map(a => (
          <Box key={`act-${a.id}`} flexDirection="row" gap={1}>
            <Text color={a.status === 'ok' ? 'success' : 'error'}>{STATUS_MARK[a.status]}</Text>
            <Text color={a.isWrite ? 'warning' : 'suggestion'}>{KIND_LABEL[a.kind]}</Text>
            <Text wrap="truncate-end">{a.title}</Text>
          </Box>
        ))}

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
