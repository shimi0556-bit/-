// סופר את קריאות הכלים של הסשן לפי קטגוריות: גיטהאב, מיומנויות, תוספים, מחברים, כלים מובנים.

export type Call = { tool: string; input: Record<string, unknown> }

export type Row = { name: string; count: number; percent: number }

export type Stats = {
  total: number
  github: Row[]
  skills: Row[]
  plugins: Row[]
  connectors: Row[]
  builtins: Row[]
}

const MCP = /^mcp__(.+?)__(.+)$/
const GIT = /^\s*(?:cd\s+\S+\s*&&\s*)?(git|gh)\s+([a-z-]+)/

/** "git push", "github: create_pull_request", או undefined אם זו לא פעולת גיטהאב */
export function githubAction(call: Call): string | undefined {
  const mcp = MCP.exec(call.tool)
  if (mcp !== null && mcp[1] === 'github') return `github: ${mcp[2]}`

  if (call.tool === 'Bash' && typeof call.input.command === 'string') {
    const git = GIT.exec(call.input.command)
    if (git !== null) return `${git[1]} ${git[2]}`
  }
  return undefined
}

function rows(counts: Map<string, number>, total: number): Row[] {
  return [...counts]
    .map(([name, count]) => ({ name, count, percent: total === 0 ? 0 : Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function bump(counts: Map<string, number>, name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1)
}

export function collect(calls: readonly Call[]): Stats {
  const github = new Map<string, number>()
  const skills = new Map<string, number>()
  const plugins = new Map<string, number>()
  const connectors = new Map<string, number>()
  const builtins = new Map<string, number>()

  for (const call of calls) {
    const action = githubAction(call)
    if (action !== undefined) bump(github, action)

    const mcp = MCP.exec(call.tool)
    if (mcp !== null) {
      bump(connectors, mcp[1] as string)
      continue
    }

    if (call.tool === 'Skill' && typeof call.input.skill === 'string') {
      const skill = call.input.skill
      bump(skills, skill)
      const colon = skill.indexOf(':')
      if (colon > 0) bump(plugins, skill.slice(0, colon))
      continue
    }

    bump(builtins, call.tool)
  }

  const total = calls.length
  return {
    total,
    github: rows(github, total),
    skills: rows(skills, total),
    plugins: rows(plugins, total),
    connectors: rows(connectors, total),
    builtins: rows(builtins, total),
  }
}
