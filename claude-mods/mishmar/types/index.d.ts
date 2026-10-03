export type MishmarLevel = 'block' | 'warn'

/** One call the guard stopped (`block`) or let through with a warning (`warn`). */
export type MishmarEvent = {
  at: number
  level: MishmarLevel
  tool: string
  what: string
  reason: string
}

/** One file the session edited, most recent last. */
export type MishmarFile = { path: string; edits: number }

export type MishmarStats = {
  /** When the session started, ms; 0 until the first event sets it. */
  startedAt: number
  /** Main-conversation turns that completed. */
  turns: number
  lastTurnSeconds: number | null
  /** Calls per tool that ran (blocked calls are not counted here). */
  tools: Record<string, number>
  files: MishmarFile[]
  errors: number
  blocked: number
  warned: number
  /** The last guard events, newest last. */
  events: MishmarEvent[]
}

export type MishmarActivityKind = 'github' | 'git' | 'skill' | 'plugin' | 'agent' | 'command'

/** One line of the activity log: GitHub/git work, a skill, a plugin or connector, a subagent. */
export type MishmarActivity = {
  id: string
  at: number
  kind: MishmarActivityKind
  title: string
  detail: string
  isWrite: boolean
  status: 'ok' | 'error' | 'denied'
}

/** Where this session runs, as the side panel shows it. */
export type MishmarEnv = {
  sessionId: string
  kind: 'cloud' | 'local'
  envType: string
  entrypoint: string
  version: string
  cwd: string
  repo: string
  branch: string
  sessionUrl: string
  surfaces: string[]
  startedAt: number
}

/** The live side panel (an artifact page) the log is mirrored to. */
export type MishmarSidebar = {
  url: string | null
  /** Why mirroring stopped, when it did; null while it works. */
  error: string | null
  synced: number
}

declare module 'claude-code' {
  interface PluginState {
    mishmar: {
      stats: MishmarStats
      isGuardOn: boolean
      isBandHidden: boolean
      activity: MishmarActivity[]
      /** Activity not yet written to the side panel, oldest first. */
      outbox: MishmarActivity[]
      env: MishmarEnv | null
      /** Set when the environment changed and the side panel has not been told yet. */
      isEnvDirty: boolean
      sidebar: MishmarSidebar
    }
  }
}
