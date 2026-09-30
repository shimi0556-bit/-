# claude-skills

Canonical local copies of two skills (`cinematic-spark`, `claude-grok-bridge`), installed into `.agents/skills` and symlinked into `.claude/skills`. Not a runnable project — skill source only.

- `cinematic-spark` pairs with `claude-spark-pack/`
- `claude-grok-bridge` pairs with `claude-grok-mcp-bridge/`

## Notes
_(empty)_

### 2026-09-30 — skills added from GitHub
Installed straight into `.claude/skills/` (tracked in `skills-lock.json`): 12 skills from `obra/superpowers` (brainstorming, TDD, writing/executing-plans, code-review pair, worktrees, subagent-driven-development, parallel agents, verification, finishing-branch, writing-skills), `web-perf` from `cloudflare/skills`, `playwright` (CLI browser automation) from `openai/skills`.
- Skipped `using-superpowers` (forces skill invocation before every reply) and `systematic-debugging` (already installed).
- `openai/develop-web-game` no longer exists (repo deprecated); `playwright` used instead.
- `playwright` skill needs `playwright-cli`/npx; not verified in this container.
