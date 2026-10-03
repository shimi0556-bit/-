# claude-mods

Claude Code **mods**: plugins of function hooks (`register(on)` in a TS/TSX module) that run inside Claude Code and hot-reload, written in this repo. One folder per mod.

- **Source:** written here (not vendored). Method: the built-in `plugin-authoring` skill.
- **Run:** `claude --plugin-dir claude-mods/<mod>` for one session, or list the folder in `CLAUDE_CODE_PLUGIN_DIRS` (in `~/.claude/settings.json` → `env`) to load it every session.
- **Check:** `claude plugin validate claude-mods/<mod>` and `claude plugin test claude-mods/<mod>`.

## Mods

| Mod | What it is |
|---|---|
| [`mishmar/`](../claude-mods/mishmar) | **משמר**: a Hebrew session dashboard (status line, band above the prompt, a pane with tool bars / edited files / guard events) plus a guard that blocks dangerous Bash commands and edits to secret files. `/mishmar [on\|off\|reset\|help]`. See its `README.md` (Hebrew). |

## How a mod is laid out

- `.claude-plugin/plugin.json`: manifest; `"types": "./types/index.d.ts"` when the mod keeps `$.state`.
- `hooks/hooks.json`: `{ "modules": ["./register.tsx"] }`.
- `hooks/register.tsx`: `export const register: Register = on => { ... }`; UI elements come from `$.ui.resolve(e)`, never globals.
- `types/index.d.ts`: `declare module 'claude-code' { interface PluginState { <mod>: { ... } } }`.
- `tests/*.test.ts`: `claude-code/testing` kit.
- `.claude-plugin/types/` is written by the engine at each load: gitignored (`claude-mods/.gitignore`).

## Notes

### 2026-10-03: mishmar created
- The user asked "צור לי מוד" and picked "dashboard + guard" (combined) from four options.
- Developed in the session's dev-mods folder (`~/.claude/dev-mods/<session>/mishmar`), then copied here. The engine's "Enable hot reloading for this session?" prompt is English-only; the user asked for Hebrew and it was declined, so the mod was never live-loaded in that session. Everything was verified with `validate` + `test` + `tsc` instead (12 tests pass).
- Gotchas hit while writing it:
  - `validate` refuses a closure parameter named `on` (shadows the registrar), e.g. `update($, atom, on => !on)`. Name it something else.
  - In `claude plugin test`, every `$` call the mod makes needs an answer beneath (the test's own `on`): `session.cwd`, `ui.open`, `ui.status`, `ui.toast`, `ui.close` return `{ value }`. Without them `ui.status`/`ui.toast` are just "dropped", but a missing `session.cwd` or `ui.open` skips the whole hook.
  - `Text` takes no `key` prop; put keys on `Box`.
  - Slash command names are `[A-Za-z0-9_-]`, so the command is `/mishmar`; the Hebrew aliases are arguments (`כבה`, `הפעל`, `אפס`, `עזרה`).
- Design decisions: the guard re-enables itself every session (state is `$.state`, not `$.store`); `/mishmar off` is refused unless `e.origin.kind` is `composer`/`bridge`/`sdk`, so the model can't switch its own guard off; guard rules live in `hooks/guard.ts` with no engine dependency so tests call them directly; a tiny shell lexer (quotes, `$( )`, `bash -c`, `eval`, here-docs) keeps false positives like `echo "rm -rf /"` or a commit message out.
- Re-asking after "Not now": the engine's watch only asks again about a mod folder it hasn't been declined for (a *new* child of `~/.claude/dev-mods/<session>/`); touching files in the declined folder or re-loading the skill does nothing. Renaming the folder (`mishmar` → `mishmar-mod`) raised the question again at turn end, the user chose "Enable for this session", and it loaded.
- After loading, the user asked "where do I see it" from the Claude app: the band (`AbovePrompt`) is terminal/desktop only, and the pane's placement depends on the surface. So `/mishmar` now prints the whole dashboard as text in the transcript (visible on every surface) plus a footer naming the attached surfaces (`$.session.surfaces()`) and whether the pane was placed. In `claude plugin test`, `session.surfaces` also needs an answer beneath.
- The engine lays a `tsconfig.json` in the mod root (`extends ./.claude-plugin/types/tsconfig.json`) on load; it's committed, so `tsc -p claude-mods/mishmar` works once the mod has loaded somewhere and the types are laid.
- `/mishmar` showed "no surface attached" in the cloud session: the Claude app (web/mobile) is not a plugin-UI surface, so panes, the band and the status line draw nowhere there (`$.session.surfaces()` is empty; `ui.open` still answers `isPlaced: true`).
- The user asked for a standing right-side bar with the environment, every GitHub action, and every skill/plugin use. Built as: an activity log in the mod (`hooks/activity.ts` classifies tool calls; a general `command.run` hook logs slash commands), plus a live **Artifact side panel** (`sidebar/index.html`, published as https://claude.ai/artifact/B6fUb4eguz7tobFxAN25SG with `db` + `user` capabilities). The mod mirrors to it through `$.tool.call({ tool: 'ArtifactData', … })`: env doc at `sessions/<sessionId>` (get → set with `if_version`), log lines batched (≤50) into `sessions/<sessionId>/events` every 2 s from a `$.clock.every` started in `session.start`. Address in `~/.claude/mishmar.json`. On any write failure the mod stops mirroring, toasts, and `/mishmar sidebar` retries.
- Validator rules learned the hard way: `$` may only be passed to functions declared in the same file (not imported helpers), and `atom(...)` refs must be consts in the same file that reads them. So all `$`-touching code and atoms live in `register.tsx`; `activity.ts` / `sidebar.ts` / `guard.ts` are pure.
- ArtifactData text formats the mod parses: `get` → a JSON line with `"version":N` (missing doc → `No document "x" in collection "y".`, not an error); `set` → `…now at version N.` An existing doc can't be `set` without `if_version`.
- Open: whether the mod's own ArtifactData calls trigger permission prompts in the user's app was not verifiable from inside the turn (it reloads at turn end). The artifact DB caps at 25,000 docs, with no pruning of old sessions yet.
- Open: not yet seen running in a real terminal (RTL/bidi rendering of the Hebrew pane in Ink is untested); not auto-loaded anywhere. Putting it under the repo's `.claude/skills/mishmar` would auto-load it in every session of this repo, which wasn't done since it changes every session's behaviour.
