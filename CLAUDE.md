# -

A personal playground repo: vendored tools/apps and Claude Code skills. See `README.md` for the project table and `skills-lock.json` for installed skills.

## Repo-wide instructions

- Whenever you build or update a game in this repo (any self-contained game, e.g. an HTML/JS game like `reversi-game/`), always send the playable file(s) to the user for download via the `SendUserFile` tool — in addition to committing and pushing it to the repo. Do this every time, not just on first creation; re-send after meaningful updates to a game the user is actively iterating on.
- After creating any HTML presentation, inject Edit Mode:
  `python3 .claude/skills/deck-edit-mode/scripts/inject_editor.py <deck.html>`
- **The user's own computer is behind NetFree** (Israeli filtered internet). Some downloads are blocked there
  (`HTTP 418 Blocked by NetFree`, or an empty error) even though they work in this cloud container — e.g. file
  downloads from huggingface.co and binary files from raw.githubusercontent.com; GitHub *release* downloads and PyPI
  go through. Whenever something the user installs or runs on their PC needs a download — and whenever such a download
  fails — use the `netfree-github-mirror` skill: mirror the files into a GitHub Release of this repo with a GitHub
  Actions workflow and download from there (resumable, sha256-checked). Test with its fake-NetFree server before
  telling the user to run anything. Reply to the user in Hebrew.

## Wiki

This repo keeps a persistent, Claude-maintained knowledge base under `wiki/` (pattern: [karpathy's LLM-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)). It exists so work on one project doesn't have to be re-discovered from scratch next session.

- **Before working on a project folder**, read its page in `wiki/` first (see `wiki/README.md` for the index) instead of re-scanning the whole folder cold.
- **After doing meaningful work** on a project — a fix, a decision, a dead end, something surprising — update that project's wiki page under a `## Notes` section: what happened, why, what's still open. Skip trivial or one-off changes.
- **New project folder added** → add a page under `wiki/` and a row in `wiki/README.md`'s table.
- **If a wiki page contradicts what you find in the code**, fix the page — the code is the source of truth, the wiki just mirrors and explains it.

Don't let the wiki go stale: an out-of-date page is worse than no page.
