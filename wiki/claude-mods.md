# claude-mods

Claude Code "mods": plugins of **function hooks** (`hooks/hooks.json` → `{ "modules": ["./register.tsx"] }`, exporting `register(on)`), written with the built-in `plugin-authoring` skill. Each lives in its own folder.

## hebrew-ui

Translates the parts of the Claude Code UI the hooks API exposes:

| What | Hook | How |
|---|---|---|
| Spinner word ("Sauteing…") | `ui.render` `Spinner` | English word hashed to a Hebrew word from `SPINNER_WORDS`; `message` translated |
| Turn-end line ("Baked for 3s") | `ui.render` `TurnDuration` | draws its own `Text`: `✻ אפה במשך 3 שנ׳` |
| Hint under the prompt | `ui.render` `PromptHint` | phrase translation; only rewrites when something changed (a rewritten `hint` replaces the live pills) |
| Mode labels, background pill, info notices | `SessionMode`, `ToolProgress`, `InfoNotice` | phrase translation |
| Collapsed tool group ("Read 3 files…") | `ui.render` `ToolGroup` | own Hebrew summary when not expanded |
| `/config` rows | `config.describe` | exact-label dictionary |
| Slash-command descriptions | `command.describe` | dictionary, built-ins only (`provider.tier === 'core'`) |
| Model replies | `prompt.compose` | appends a session section: answer in Hebrew |

Dictionaries are in `hooks/he.ts`; anything not in them stays English. `PHRASES` keys shorter than 6 chars match only as the whole string (so `to`, `fast` don't mangle other text).

Tests: `claude plugin test claude-mods/hebrew-ui` (3 tests). Validate: `claude plugin validate claude-mods/hebrew-ui`.

## Notes

- 2026-10-04: created. **Not translatable through the API** (as of 2.1.289): the welcome logo box, the `/` command menu chrome, permission dialogs, the actual tool-row titles' wording beyond props, and the terminal's own RTL handling — most terminals render Hebrew left-to-right, so mixed lines can look reversed. The English strings in `PHRASES`/`CONFIG_LABELS` were written from known UI text, not read from the engine; if a string doesn't translate, check the exact wording the engine draws and add it.
