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

## session-activity

A logo (`assets/logo-160.png`, embedded as base64 in the generated `hooks/logo.ts`) drawn in the band above the prompt (`ui.render` `AbovePrompt`), with a `📊 הפעילות שלי` Button (hotkey `a`) and a `/activity` command that open a pane (`$.ui.open`, id `session-activity`).

The pane reads the whole transcript with `$.session.messages()` on every draw (so it counts calls made before the mod loaded too) and `hooks/stats.ts` classifies each tool use: GitHub (`mcp__github__*` and Bash `git …`/`gh …`), skills (`Skill` tool's `input.skill`), plugins (the `plugin:` prefix of a skill name), connectors (the MCP server name in `mcp__<server>__…`), and built-in tools. Percent = share of all tool calls in the session. Refreshed via `$.ui.invalidate('ui.render')` on `turn.complete` and on open.

### Notes

- 2026-10-04: created. The logo itself is **not clickable**: `Image` (terminal) and `Svg` (desktop) are leaves with no `onPress`; only `Button` is pressable, so the button sits beside the logo. Terminal shows the picture only in kitty/Ghostty (else the `alt` glyph); desktop draws it via an `<svg><image href="data:image/png;base64,…">` (`Svg` source limit is 131072 chars — the 160px PNG is ~56K base64). Subagents' own tool calls aren't in the main transcript, so they aren't counted. To regenerate `logo.ts` after replacing the PNG, rerun the base64 snippet (convert -resize 160x160, then base64 into `LOGO_PNG_160`).
- 2026-10-04: the user (watching the cloud session from the Claude app) saw no logo. `AbovePrompt` is raised only on terminal and desktop, so the logo + button now also wrap every `UserMessage` the person typed (origin `composer`/`bridge`/`sdk`) and the first block of every `AssistantMessage`, which are raised on every surface (mobile/vscode use `Svg`). Gotcha: a helper that takes `$` must be a top-level function declaration, or the module refuses to load (`$ is passed to "logoRow", which is not a function declared at the top of this file`). Still unverified on the user's actual client.
