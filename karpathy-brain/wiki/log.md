# Log

Append-only. Newest at the bottom. `grep "^## \[" log.md | tail -5` shows the latest entries.

## [2026-10-11] crawl | initial collection
`tools/crawl.py`, one worker per source family. Got 58 files, ~161K words: blog 23, bearblog 13 (via the Wayback Machine; direct access returns 403), medium 2, GitHub READMEs 17, gists 2, interviews 1 (Dwarkesh 2025). Failed: all 9 YouTube transcripts (YouTube bot check from this server), X posts (no TwitterAPI.io key), Lex Fridman transcript (404), 3 repo READMEs (convnetjs, char-rnn, randomfun). See `raw/*/manifest.md`.

## [2026-10-11] compile | wiki v1
58 source pages, 9 principle pages, 6 method pages, rules.md (7 rules, each with quotes from ≥2 original contexts; 4 candidates), _hot.md, index.md. `tools/check_wiki.py`: every quote verified verbatim against raw/.

## [2026-10-11] package | agent, skills, run gate
`.claude/agents/karpathy.md`, `.claude/skills/karpathy-teach`, `.claude/skills/karpathy-ingest`, `.claude/hooks/karpathy_run_gate.py` (Stop + SubagentStop). The hook's settings entry is in `karpathy-brain/hooks/settings.snippet.json`, waiting for the owner to approve it into `.claude/settings.json`.

## [2026-10-12] package | hook registered, graph
Owner approved the run-gate hook; it is now in `.claude/settings.json`. Added `tools/build_graph.py` → `graph.html` (interactive wiki graph, 82 nodes, 152 edges, 20 orphan sources).
