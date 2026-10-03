// What the activity log records: GitHub and git work, skills, plugins and
// connectors (MCP tools), subagents and slash commands. Pure functions, no
// engine calls, so tests can call them directly.

import type { ToolCallInput } from 'claude-code'

import type { MishmarActivityKind } from '../types'
import { lex, unwrap } from './guard'

export type Activity = {
  kind: MishmarActivityKind
  title: string
  detail: string
  /** True for an action that changes something on GitHub (a push, a PR, a comment). */
  isWrite: boolean
}

/** Isolates a left-to-right fragment (a path, a repo, a command) inside Hebrew text. */
export const ltr = (text: string) => (text === '' ? '' : `⁨${text}⁩`)

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** A field of a tool's input that the union does not type (MCP tools), as text. */
function field(e: ToolCallInput, name: string): string {
  const value = (e as unknown as Record<string, unknown>)[name]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

// ---------- GitHub through MCP ----------

const GITHUB_READ = /^(get_|list_|search_)|_read$|^actions_(get|list)$/
const REMOTE_GITHUB = new Set(['add_repo', 'subscribe_pr_activity', 'unsubscribe_pr_activity'])

function githubDetail(e: ToolCallInput): string {
  const owner = field(e, 'owner')
  const repo = field(e, 'repo')
  const number = field(e, 'pullNumber') || field(e, 'issue_number') || field(e, 'pull_number')
  const branch = field(e, 'branch') || field(e, 'head')
  const title = field(e, 'title')
  const parts: string[] = []
  if (owner !== '' || repo !== '') parts.push(ltr([owner, repo].filter(Boolean).join('/')))
  if (number !== '') parts.push(ltr(`#${number}`))
  if (branch !== '') parts.push(`ענף ${ltr(branch)}`)
  if (title !== '') parts.push(ltr(clip(title, 80)))
  return parts.join(' · ')
}

/** `mcp__server__tool` → `{ server, tool }`, or null for a built-in tool. */
export function splitMcp(name: string): { server: string; tool: string } | null {
  if (!name.startsWith('mcp__')) return null
  const rest = name.slice(5)
  const at = rest.indexOf('__')
  return at < 0 ? { server: rest, tool: '' } : { server: rest.slice(0, at), tool: rest.slice(at + 2) }
}

// ---------- git and gh in Bash ----------

const GIT_REMOTE = new Set(['push', 'pull', 'fetch', 'clone', 'ls-remote'])
const GIT_LOCAL = new Set([
  'commit', 'merge', 'rebase', 'reset', 'tag', 'cherry-pick', 'revert', 'stash',
  'checkout', 'switch', 'branch', 'restore', 'am', 'init', 'remote',
])
const GH_READ = new Set(['view', 'list', 'status', 'diff', 'checks', 'browse', 'search', 'auth'])

/** Rank of a git/gh segment: a push outranks other remote work, which outranks local commits. */
function rankShell(words: string[]): { rank: number; activity: Activity } | null {
  const [head, ...args] = unwrap(words)
  const cmd = head?.split('/').pop()
  if (cmd === 'gh') {
    const verb = args[1] ?? args[0] ?? ''
    const isWrite = !GH_READ.has(verb)
    return { rank: isWrite ? 3 : 2, activity: { kind: 'github', title: clip(words.join(' '), 90), detail: 'GitHub CLI', isWrite } }
  }
  if (cmd !== 'git') return null
  let i = 0
  while (i < args.length && (args[i] ?? '').startsWith('-')) i += args[i] === '-C' || args[i] === '-c' ? 2 : 1
  const sub = args[i] ?? ''
  const title = clip(['git', ...args.slice(i)].join(' '), 90)
  if (GIT_REMOTE.has(sub)) {
    const isPush = sub === 'push'
    return { rank: isPush ? 3 : 2, activity: { kind: 'github', title, detail: isPush ? 'דחיפה לשרת' : 'קריאה מהשרת', isWrite: isPush } }
  }
  if (GIT_LOCAL.has(sub)) return { rank: 1, activity: { kind: 'git', title, detail: '', isWrite: false } }
  return null
}

/** The git or GitHub work in a Bash command, the most significant part first; null when none. */
export function classifyShell(command: string): Activity | null {
  const found = lex(command)
    .map(rankShell)
    .filter((x): x is { rank: number; activity: Activity } => x !== null)
    .sort((a, b) => b.rank - a.rank)
  const top = found[0]
  if (top === undefined) return null
  const others = found.length - 1
  return others > 0
    ? { ...top.activity, detail: [top.activity.detail, `ועוד ${others} פעולות git בפקודה`].filter(Boolean).join(' · ') }
    : top.activity
}

// ---------- the classifier ----------

/** What the log records for a tool call, or null for a call it leaves out. */
export function classify(e: ToolCallInput): Activity | null {
  if (e.tool === 'Bash') return classifyShell(e.command)
  if (e.tool === 'Skill') return { kind: 'skill', title: e.skill, detail: e.args ? ltr(clip(e.args, 100)) : '', isWrite: false }
  if (e.tool === 'Agent') {
    return { kind: 'agent', title: e.subagent_type ?? 'general-purpose', detail: ltr(clip(e.description, 100)), isWrite: false }
  }

  const mcp = splitMcp(String(e.tool))
  if (mcp === null) return null
  if (mcp.server === 'github') {
    return { kind: 'github', title: mcp.tool, detail: githubDetail(e), isWrite: !GITHUB_READ.test(mcp.tool) }
  }
  if (mcp.server === 'claude-code-remote' && REMOTE_GITHUB.has(mcp.tool)) {
    return { kind: 'github', title: mcp.tool, detail: githubDetail(e), isWrite: false }
  }
  return { kind: 'plugin', title: mcp.tool === '' ? mcp.server : `${mcp.server} · ${mcp.tool}`, detail: '', isWrite: false }
}

/** A slash command the person ran (skills and plugin commands among them). */
export function classifyCommand(command: string, args: string): Activity {
  return { kind: 'command', title: `/${command}`, detail: args.trim() === '' ? '' : ltr(clip(args, 100)), isWrite: false }
}

/** Whether a Bash command may have moved HEAD to another branch (the environment's branch line). */
export const changesBranch = (command: string) => /\bgit\b[^;&|]*\b(checkout|switch|branch\s+-[mM])\b/.test(command)
