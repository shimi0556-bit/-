# claude-skills

Canonical local copies of skills installed into `.agents/skills` and symlinked into `.claude/skills` (`cinematic-spark`, `claude-grok-bridge`, `interactive-course-builder`, `voice-studio`, `netfree-github-mirror`). Not a runnable project — skill source only.

- `cinematic-spark` pairs with `claude-spark-pack/`
- `claude-grok-bridge` pairs with `claude-grok-mcp-bridge/`
- `voice-studio` pairs with `voice-studio/` (see `wiki/voice-studio.md`)
- `netfree-github-mirror` — generic recipe for the user's NetFree-filtered PC: mirror blocked downloads into a GitHub
  Release via Actions (`mirror-release.yml` template), download with `download-release.ps1` (resume + sha256),
  test with `netfree418.py`. Distilled from voice-studio's model download; also zipped in `zips/` for claude.ai.

## Notes
_(empty)_

### 2026-09-30 — skills added from GitHub
Installed straight into `.claude/skills/` (tracked in `skills-lock.json`): 12 skills from `obra/superpowers` (brainstorming, TDD, writing/executing-plans, code-review pair, worktrees, subagent-driven-development, parallel agents, verification, finishing-branch, writing-skills), `web-perf` from `cloudflare/skills`, `playwright` (CLI browser automation) from `openai/skills`.
- Skipped `using-superpowers` (forces skill invocation before every reply) and `systematic-debugging` (already installed).
- `openai/develop-web-game` no longer exists (repo deprecated); `playwright` used instead.
- `playwright` skill needs `playwright-cli`/npx; not verified in this container.

### 2026-09-30 — netfree-github-mirror
Saved at the user's request so a blocked download on their PC gets the GitHub-release fix directly next time.
`download-release.ps1` was tested against the real `voice-models-v1` release (1 GB file joined from 3 parts,
byte-identical; re-run skips; unknown `-Only` name errors). With `powershell -File`, `-Only a,b` arrives as one
string — the script splits it. `CLAUDE.md` points every session at the skill.
