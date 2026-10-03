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

declare module 'claude-code' {
  interface PluginState {
    mishmar: { stats: MishmarStats; isGuardOn: boolean; isBandHidden: boolean }
  }
}
