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

### 2026-10-01 — lessons from the daily 3D library
- New local skill `.claude/skills/boneh-dgamim-3d/` (Hebrew), created with the `amitlamed-maavar-vemelamed-skillime` skill at the user's request. It distils the method, mistakes and next-level ideas from building #001 "The Beast".
- Added lessons to the account-skill copies `claude-skills/bodek-mishakei-3d` (a new section: lessons from the daily 3D library) and `claude-skills/boneh-olamot-mishak-3d` (§5א). These are local copies only: re-upload them in claude.ai to update the account versions.
- Added local reference files plus pointer lines to the vendored `threejs-aaa-graphics-builder`, `threejs-debug-profiler`, `threejs-qa-release` and `playwright`. Their `skills-lock.json` hashes no longer match, and an upstream update will overwrite the additions.
