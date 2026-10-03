// Pure helpers for the environment card and the side panel (an artifact page
// whose database the hooks write through the ArtifactData tool). The calls on $
// live in register.tsx: the engine follows $ only within one file.

import type { MishmarActivity } from '../types'
import type { Activity } from './activity'

/** Where the side panel's address is kept, under the home folder. */
export const CONFIG_PATH = '.claude/mishmar.json'
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(code\/)?artifact\/[\w-]+$/

/** The side panel's address from the config file's text (`{ "sidebarUrl": "…" }`), or null. */
export function parseSidebarUrl(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text)
    const url = (parsed as { sidebarUrl?: unknown } | null)?.sidebarUrl
    return typeof url === 'string' && ARTIFACT_URL.test(url) ? url : null
  } catch {
    return null
  }
}

/** `owner/name` from a git remote URL (https, ssh or the cloud proxy's), or ''. */
export function repoName(remote: string): string {
  const match = /([^/:]+)\/([^/:]+?)(\.git)?\/?$/.exec(remote.trim())
  return match ? `${match[1]}/${match[2]}` : ''
}

/** The claude.ai link of a cloud session from its remote id (`cse_…`), or ''. */
export const sessionUrlFrom = (remoteId: string | undefined) =>
  remoteId?.startsWith('cse_') ? `https://claude.ai/code/session_${remoteId.slice(4)}` : ''

/** A log line with a fresh id. */
export function newActivity(act: Activity, status: MishmarActivity['status'], at: number): MishmarActivity {
  return { id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, at, ...act, status }
}

/** The version an ArtifactData `get` answered, or undefined when the document does not exist yet. */
export function versionFrom(getText: string): number | undefined {
  const match = /"version":\s*(\d+)/.exec(getText)
  return match ? Number(match[1]) : undefined
}
