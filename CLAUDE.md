# -

A personal playground repo: vendored tools/apps and Claude Code skills. See `README.md` for the project table and `skills-lock.json` for installed skills.

## Repo-wide instructions

- Talk to the user in Hebrew, and always ask questions in Hebrew (including the options in `AskUserQuestion`).
- Whenever you build or update a game in this repo (any self-contained game, e.g. an HTML/JS game like `reversi-game/`), always send the playable file(s) to the user for download via the `SendUserFile` tool — in addition to committing and pushing it to the repo. Do this every time, not just on first creation; re-send after meaningful updates to a game the user is actively iterating on.
- After creating any HTML presentation, inject Edit Mode:
  `python3 .claude/skills/deck-edit-mode/scripts/inject_editor.py <deck.html>`

## Wiki

This repo keeps a persistent, Claude-maintained knowledge base under `wiki/` (pattern: [karpathy's LLM-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)). It exists so work on one project doesn't have to be re-discovered from scratch next session.

- **Before working on a project folder**, read its page in `wiki/` first (see `wiki/README.md` for the index) instead of re-scanning the whole folder cold.
- **After doing meaningful work** on a project — a fix, a decision, a dead end, something surprising — update that project's wiki page under a `## Notes` section: what happened, why, what's still open. Skip trivial or one-off changes.
- **New project folder added** → add a page under `wiki/` and a row in `wiki/README.md`'s table.
- **If a wiki page contradicts what you find in the code**, fix the page — the code is the source of truth, the wiki just mirrors and explains it.

Don't let the wiki go stale: an out-of-date page is worse than no page.
