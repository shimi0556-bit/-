# mapat-hanefesh (מפת הנפש)

Single-file Hebrew (RTL) Obsidian-style journal: stories with `[[concept]]` links, concept types (value/emotion/belief/need/behavior/person), relations (leads/supports/conflicts/protects/masks/related), graph + insights, Mistral suggestions and a "mirror". Originally built in a session on branch `claude/serene-cannon-p1evet` (never merged); copied here on 2026-10-10 so it sits next to `brain-graph/`.

## Notes

- **2026-10-10.** A live postMessage bridge (with an approval dialog) was added to this file and then removed again the same day: the user did not want a bridge, only for the AIs to talk. The file is back to its original content. Its backup JSON is read by `brain-graph` (`src/mapat.js` and the "שיחה" room), see `wiki/brain-graph.md`.
- Related, not in the repo: two other versions of the same idea built by other tools, "המפה הנפשית שלי" (one by Google, one by newer Claude; items[] with type/title/text/refs, GPT chat, `window.APP`). The user uploaded them in the session; Atlas reads their export files (a plain JSON array of items).
