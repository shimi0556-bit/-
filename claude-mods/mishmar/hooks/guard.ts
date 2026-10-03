// The guard's rules, kept apart from the hooks so tests can call them directly.
// Best effort: a small shell lexer plus a list of known-dangerous shapes. It
// catches the common accidents, not a determined attacker.

import type { MishmarLevel } from '../types'

export type Verdict = { level: MishmarLevel; reason: string }

const block = (reason: string): Verdict => ({ level: 'block', reason })
const warn = (reason: string): Verdict => ({ level: 'warn', reason })

/** The strongest verdict of several: any block wins over a warning. */
const strongest = (verdicts: (Verdict | null)[]): Verdict | null =>
  verdicts.find(v => v?.level === 'block') ?? verdicts.find(v => v !== null) ?? null

// ---------- shell commands ----------

/** Drops here-doc bodies (`<<EOF ... EOF`): they are data, not commands. */
const stripHeredocs = (cmd: string): string =>
  cmd.replace(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<heredoc')

/**
 * Splits a command line into simple commands (on `;`, `&&`, `||`, `|`, `&`,
 * newlines and `$( )` / backticks), each a list of words with quotes removed.
 * Redirections and comments are dropped.
 */
export function lex(cmd: string): string[][] {
  const src = stripHeredocs(cmd)
  const segments: string[][] = []
  let seg: string[] = []
  let tok = ''
  let inTok = false
  const push = () => {
    if (inTok) seg.push(tok)
    tok = ''
    inTok = false
  }
  const end = () => {
    push()
    if (seg.length > 0) segments.push(seg)
    seg = []
  }

  let i = 0
  while (i < src.length) {
    const c = src[i] ?? ''
    if (c === "'") {
      const j = src.indexOf("'", i + 1)
      tok += j < 0 ? src.slice(i + 1) : src.slice(i + 1, j)
      inTok = true
      i = j < 0 ? src.length : j + 1
    } else if (c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) {
          tok += src[j + 1]
          j += 2
        } else {
          tok += src[j]
          j += 1
        }
      }
      inTok = true
      i = j + 1
    } else if (c === '\\') {
      if (src[i + 1] !== '\n') {
        tok += src[i + 1] ?? ''
        inTok = true
      }
      i += 2
    } else if (c === '#' && !inTok) {
      const j = src.indexOf('\n', i)
      i = j < 0 ? src.length : j
    } else if (c === '\n' || c === ';' || c === '|' || c === '&' || c === '`' || c === ')' || c === '(') {
      end()
      i += 1
    } else if (c === '$' && src[i + 1] === '(') {
      end()
      i += 2
    } else if (c === '>' || c === '<') {
      // A redirection: drop a leading fd number, the operator and its target.
      if (/^\d+$/.test(tok)) {
        tok = ''
        inTok = false
      } else {
        push()
      }
      while (i < src.length && /[<>&|]/.test(src[i] ?? '')) i += 1
      if (/[\d-]/.test(src[i] ?? '') && src[i - 1] === '&') {
        while (i < src.length && /[\d-]/.test(src[i] ?? '')) i += 1
      } else {
        while (i < src.length && /[ \t]/.test(src[i] ?? '')) i += 1
        while (i < src.length && !/[\s;&|()<>]/.test(src[i] ?? '')) i += 1
      }
    } else if (/\s/.test(c)) {
      push()
      i += 1
    } else {
      tok += c
      inTok = true
      i += 1
    }
  }
  end()
  return segments
}

const PREFIXES = new Set(['sudo', 'doas', 'command', 'exec', 'nohup', 'time', 'nice', 'xargs', 'env', 'builtin'])
const OPTION_WITH_VALUE = new Set(['-u', '-g', '-n', '-I', '-P', '-L'])

/** Drops `sudo`, `env X=1`, `xargs -0` and the like in front of the real command. */
function unwrap(words: string[]): string[] {
  let i = 0
  while (i < words.length) {
    const w = words[i] ?? ''
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
      i += 1
    } else if (PREFIXES.has(w)) {
      i += 1
      while (i < words.length && (words[i] ?? '').startsWith('-')) {
        i += OPTION_WITH_VALUE.has(words[i] ?? '') ? 2 : 1
      }
    } else {
      break
    }
  }
  return words.slice(i)
}

const SYSTEM_DIRS =
  /^\/(bin|boot|dev|etc|home|lib|lib32|lib64|opt|proc|root|sbin|srv|sys|usr|var|Users|System|Applications|Library|Volumes)$/

/** A path whose recursive removal (or chmod) wrecks the machine, home or repo. */
export function isCriticalTarget(target: string): boolean {
  let t = target.replace(/\/\*$/, '')
  if (t.length > 1) t = t.replace(/\/+$/, '')
  if (t === '') t = '/'
  return (
    t === '/' ||
    t === '*' ||
    t === '.' ||
    t === '..' ||
    t === '~' ||
    t === '$HOME' ||
    t === '${HOME}' ||
    t === '.git' ||
    t.endsWith('/.git') ||
    SYSTEM_DIRS.test(t)
  )
}

/** Splits words into flags (short clusters and `--long`) and operands. */
function parseArgs(args: string[]): { flags: string[]; operands: string[] } {
  const flags: string[] = []
  const operands: string[] = []
  let isAfterDashes = false
  for (const a of args) {
    if (!isAfterDashes && a === '--') isAfterDashes = true
    else if (!isAfterDashes && a.startsWith('-') && a.length > 1) flags.push(a)
    else operands.push(a)
  }
  return { flags, operands }
}

const hasShort = (flags: string[], letters: RegExp) =>
  flags.some(f => !f.startsWith('--') && letters.test(f.slice(1)))

function checkRm(args: string[]): Verdict | null {
  const { flags, operands } = parseArgs(args)
  if (flags.includes('--no-preserve-root')) {
    return block('rm עם ‎--no-preserve-root‎ מבטל את ההגנה על תיקיית השורש')
  }
  const isRecursive = flags.includes('--recursive') || hasShort(flags, /[rR]/)
  if (!isRecursive) return null
  const target = operands.find(isCriticalTarget)
  return target === undefined
    ? null
    : block(`מחיקה רקורסיבית של ‎${target}‎ — זו תיקייה קריטית (שורש, בית, מערכת או ‎.git‎)`)
}

function checkGit(args: string[]): Verdict | null {
  let i = 0
  while (i < args.length && (args[i] ?? '').startsWith('-')) {
    i += args[i] === '-C' || args[i] === '-c' ? 2 : 1
  }
  const sub = args[i]
  const { flags, operands } = parseArgs(args.slice(i + 1))

  if (sub === 'push') {
    const isForced =
      flags.includes('--force') || hasShort(flags, /f/) || operands.some(o => /^\+[^+]/.test(o))
    if (isForced) {
      return block('git push בכוח דורס היסטוריה בשרת. אם צריך, השתמש ב-‎--force-with-lease‎')
    }
    if (flags.includes('--mirror')) return block('git push --mirror מחליף את כל הענפים בשרת')
    if (flags.includes('--delete') || hasShort(flags, /d/) || operands.some(o => /^:[^:]/.test(o))) {
      return warn('מחיקת ענף בשרת (git push --delete)')
    }
  }
  if (sub === 'reset' && flags.includes('--hard')) {
    return warn('git reset --hard זורק שינויים שלא נשמרו בקומיט')
  }
  if (sub === 'clean' && (flags.includes('--force') || hasShort(flags, /f/))) {
    return warn('git clean -f מוחק קבצים שלא במעקב של git')
  }
  if (sub === 'branch' && (hasShort(flags, /D/) || (flags.includes('--delete') && flags.includes('--force')))) {
    return warn('git branch -D מוחק ענף גם אם הוא לא מוזג')
  }
  if (sub === 'filter-branch' || sub === 'filter-repo') {
    return warn(`git ${sub} כותב מחדש את כל ההיסטוריה`)
  }
  return null
}

function checkPermissions(cmd: string, args: string[]): Verdict | null {
  const { flags, operands } = parseArgs(args)
  const isRecursive = flags.includes('--recursive') || hasShort(flags, /R/)
  if (!isRecursive) return null
  const paths = cmd === 'chmod' || cmd === 'chown' || cmd === 'chgrp' ? operands.slice(1) : operands
  const target = paths.find(isCriticalTarget)
  if (target !== undefined) return block(`${cmd} רקורסיבי על ‎${target}‎ — תיקייה קריטית`)
  if (cmd === 'chmod' && operands[0] !== undefined && /^0?777$/.test(operands[0])) {
    return warn('chmod -R 777 פותח הרשאות כתיבה לכולם')
  }
  return null
}

const FIND_FILTERS = new Set([
  '-name', '-iname', '-path', '-ipath', '-regex', '-iregex', '-type',
  '-newer', '-mtime', '-mmin', '-size', '-empty', '-user',
])

/** One simple command, already lexed; `depth` bounds `bash -c` / `eval` nesting. */
function checkWords(words: string[], depth: number): Verdict | null {
  const [head, ...args] = unwrap(words)
  if (head === undefined) return null
  const cmd = head.split('/').pop() ?? head

  if (cmd === 'rm') return checkRm(args)
  if (cmd === 'git') return checkGit(args)
  if (cmd === 'chmod' || cmd === 'chown' || cmd === 'chgrp') return checkPermissions(cmd, args)
  if (/^mkfs(\.\w+)?$/.test(cmd) || cmd === 'wipefs') return block(`${cmd} מפרמט או מוחק דיסק`)
  if (cmd === 'dd' && args.some(a => /^of=\/dev\/(sd|hd|vd|xvd|nvme|disk|rdisk|mmcblk)/.test(a))) {
    return block('dd שכותב ישירות על דיסק')
  }
  if (cmd === 'shred' && args.some(a => a.startsWith('/dev/'))) return block('shred על התקן דיסק')
  if (cmd === 'find' && args.includes('-delete')) {
    const root = args.find(a => !a.startsWith('-'))
    // `find . -name '*.tmp' -delete` is cleanup; `find . -delete` or `find / ... -delete` is not.
    const isHere = root === '.' || root === './' || root === '..' || root === '../'
    const isFiltered = args.some(a => FIND_FILTERS.has(a))
    if (root !== undefined && isCriticalTarget(root) && !(isHere && isFiltered)) {
      return block(`find ‎${root}‎ -delete מוחק תיקייה קריטית`)
    }
  }
  if (depth < 3 && /^(ba|z|da|k|fi)?sh$/.test(cmd)) {
    const at = args.indexOf('-c')
    const script = at >= 0 ? args[at + 1] : undefined
    if (script !== undefined) return checkCommand(script, depth + 1)
  }
  if (depth < 3 && cmd === 'eval') return checkCommand(args.join(' '), depth + 1)
  return null
}

/** The guard's verdict on a Bash command: a block, a warning, or null to let it run. */
export function checkCommand(command: string, depth = 0): Verdict | null {
  const whole: (Verdict | null)[] = [
    /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:?\s*&\s*\}\s*;\s*:/.test(command) ? block('fork bomb — מקריס את המחשב') : null,
    />\s*\/dev\/(sd|hd|vd|xvd|nvme|disk|rdisk|mmcblk)\w*/.test(command) ? block('כתיבה ישירה על דיסק') : null,
    /\b(curl|wget)\b[^\n;]*\|\s*(sudo\s+)?(ba|z|da|k|fi)?sh\b/.test(command)
      ? warn('הורדת סקריפט מהרשת והרצה שלו ישר ב-shell')
      : null,
    /\bdrop\s+(database|schema|table)\b/i.test(command) ? warn('DROP במסד נתונים') : null,
    /\btruncate\s+table\b/i.test(command) ? warn('TRUNCATE במסד נתונים') : null,
  ]
  return strongest([...whole, ...lex(command).map(words => checkWords(words, depth))])
}

// ---------- files ----------

/** The guard's verdict on editing or writing `path`: a block, or null. */
export function checkPath(path: string): Verdict | null {
  const p = path.replace(/\\/g, '/')
  const base = p.split('/').pop() ?? p

  if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample|template|dist|defaults?)$/.test(base)) {
    return block(`‎${base}‎ מחזיק סודות (מפתחות API, סיסמאות)`)
  }
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(base)) return block(`‎${base}‎ הוא מפתח פרטי או תעודה`)
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return block(`‎${base}‎ הוא מפתח SSH פרטי`)
  if (/(^|\/)\.ssh\//.test(p)) return block('קבצים בתיקיית ‎.ssh‎')
  if (/(^|\/)\.aws\/credentials$/.test(p) || base === '.netrc' || /(^|\/)\.docker\/config\.json$/.test(p)) {
    return block(`‎${base}‎ מחזיק פרטי התחברות`)
  }
  if (/(^|\/)\.git\//.test(p)) return block('קבצים פנימיים של ‎.git‎ — עדיף לעבוד דרך פקודות git')
  return null
}
