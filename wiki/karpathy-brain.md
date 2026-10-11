# karpathy-brain

"Another Andrej Karpathy" built with Claude Code, following Nate Herk's video (`bvGptCLDhyo`): raw public sources → LLM wiki → 7 source-backed teaching rules → `karpathy` subagent + `/karpathy-teach` + `/karpathy-ingest` skills + a run-gate Stop hook.

- **Folder:** [`karpathy-brain/`](../karpathy-brain) (see its README), plus `.claude/agents/karpathy.md`, `.claude/skills/karpathy-{teach,ingest}/`, `.claude/hooks/karpathy_run_gate.py`.
- **Run:** `/karpathy-teach <what to build/explain/review>`. Checks: `python3 karpathy-brain/tools/check_wiki.py`, `python3 karpathy-brain/tools/test_run_gate.py`.
- **Own wiki:** `karpathy-brain/wiki/` is the knowledge base the agent reads (schema: `karpathy-brain/CLAUDE.md`). This page only tracks the project.

## Notes

- **2026-10-11, built.** Crawl: 58 files, ~161K words (blog, bearblog via the Wayback Machine since direct access returns 403, Medium via the Wayback Machine, 17 READMEs, 2 gists, Dwarkesh 2025 transcript). Failed: YouTube transcripts (the server gets the bot check from both yt-dlp and youtube-transcript-api), X (no TwitterAPI.io key), Lex Fridman transcript (404). Archive.org resets/429s Python urllib but serves curl, so `crawl.py` fetches through curl.
- `raw/` is gitignored (copyrighted text); only manifests are committed. `check_wiki.py` verifies all 128 quotes verbatim against raw/ and fails on a planted fake quote (tested).
- **Hook not active yet.** Writing `.claude/settings.json` was blocked by the auto-mode permission classifier (self-modification). The entry is in `karpathy-brain/hooks/settings.snippet.json`; the owner has to approve merging it.
- New agent definitions load at session start only: in the session that created it, `subagent_type: "karpathy"` failed with "not found", so the step-6 test ran a general-purpose agent instructed to follow `karpathy.md` verbatim. Result: 7/7 rules, stayed within its reading budget (hot + index + 5 pages), every output re-run by hand and matched.
- That test showed the agent writes code via `cat > x.py <<EOF`, which the first gate version missed (it only watched Write/Edit). Fixed: shell writes to code files now count as edits; 15-case test in `tools/test_run_gate.py`.
- Open: YouTube lecture transcripts would be the most valuable missing source (teaching moves are currently known second-hand). Rule 6's "ask when the request is thin" part is marked (inferred).
