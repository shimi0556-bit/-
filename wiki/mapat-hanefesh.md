# mapat-hanefesh (מפת הנפש)

Single-file Hebrew (RTL) Obsidian-style journal: stories with `[[concept]]` links, concept types (value/emotion/belief/need/behavior/person), relations (leads/supports/conflicts/protects/masks/related), graph + insights, Mistral suggestions and a "mirror". Originally built in a session on branch `claude/serene-cannon-p1evet` (never merged); copied here on 2026-10-10 so it can sit next to `brain-graph/`.

## Notes

- **2026-10-10, bridge to brain-graph.** Appended an IIFE at the end of the main script ("גשר לאטלס המוח"). It only reacts to `postMessage` from `window.parent`/`window.opener`, messages tagged `bridge:'atlas-bridge', from:'atlas'`. `hello` is answered without approval (counts only); `snapshot`, `ask`, `apply` first show an in-page approve dialog (private diary content leaves the app). `ask` builds a digest (concepts by type, 70 relations, last 6 stories clipped) and answers via `askAI`; with no key it forwards the prompt to the parent (`need-llm` -> `llm-result`). `apply` adds concepts (`auto:false`) and relations with dedupe, then `commit()`. The self-saving "standalone file" feature captures the script text, so the bridge survives it.
- Tested with Playwright over a local http server (both apps in one origin tree), mocked Anthropic endpoint.
- Open: the real Mistral path and a real cross-origin setup (two claude.ai artifacts) were not exercised; embedding a claude.ai artifact URL in an iframe is probably blocked, "open in window" is the fallback.
