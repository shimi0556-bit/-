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
- Open: not yet seen running in a real terminal (RTL/bidi rendering of the Hebrew pane in Ink is untested); not auto-loaded anywhere. Putting it under the repo's `.claude/skills/mishmar` would auto-load it in every session of this repo, which wasn't done since it changes every session's behaviour.
