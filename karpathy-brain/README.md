# karpathy-brain

**"Another Andrej Karpathy" built with Claude Code**, following the workflow in Nate Herk's video [I Built Another Andrej Karpathy Using Claude](https://www.youtube.com/watch?v=bvGptCLDhyo). It isn't a voice clone or a fine-tuned model. It's an agent that teaches and builds by rules distilled from Karpathy's public writing, with a wiki that backs every claim with a quote.

> סוכן Claude Code שמלמד ובונה לפי 7 כללים שזוקקו מהכתבים הפומביים של אנדריי קרפתי. כל טענה עליו מגובה בציטוט מדויק מהמקור, ויש hook שלא נותן לסוכן לסיים לפני שהריץ את הקוד שכתב.

## Usage

```
/karpathy-teach build me a tiny byte-pair tokenizer from scratch and teach me what it does
/karpathy-teach תסביר לי backpropagation דרך בנייה
/karpathy-teach review path/to/file.py the way Karpathy would. Would he accept it? What would he delete?
/karpathy-ingest https://karpathy.bearblog.dev/<new-post>/
```

Example output: [demo/bpe/LESSON.md](demo/bpe/LESSON.md) (the video's test, run for real: 7/7 rules, every output re-run and matched).

## How it was built (the video's six steps)

| # | Step | Here |
|---|---|---|
| 1 | Gather raw sources, one worker per source, with manifests | [`tools/crawl.py`](tools/crawl.py) → `raw/` (58 files, ~161K words). Manifests: [`raw/*/manifest.md`](raw/) |
| 2 | Compile a wiki (LLM-wiki pattern): index, log, page per source, principles, methods, hot page < 500 words | [`wiki/`](wiki/index.md): 58 source pages, 9 principles, 6 methods, [`_hot.md`](wiki/_hot.md) |
| 3 | Derive rules: only rules found in ≥2 places, each with an exact quote | [`wiki/rules.md`](wiki/rules.md): 7 rules + candidates |
| 4 | Agent + skill | [`.claude/agents/karpathy.md`](../.claude/agents/karpathy.md), [`.claude/skills/karpathy-teach`](../.claude/skills/karpathy-teach/SKILL.md) (delegates, then grades against the 7 rules) |
| 5 | Stop hook: "Karpathy rule, run it before you say it works" | [`.claude/hooks/karpathy_run_gate.py`](../.claude/hooks/karpathy_run_gate.py) + tests [`tools/test_run_gate.py`](tools/test_run_gate.py). Registered in `.claude/settings.json` (active from the next session) |
| 6 | Test on a tiny BPE tokenizer | [`demo/bpe/`](demo/bpe/) |
| + | Ingest new sources (shown in the video, but no creation prompt was given) | [`.claude/skills/karpathy-ingest`](../.claude/skills/karpathy-ingest/SKILL.md) |

## Graph

[`graph.html`](graph.html) shows the wiki as an interactive graph, like Obsidian's graph view: pages are nodes, links and quote citations are edges, and each rule is linked to the sources that back it. Regenerate after every ingest with `python3 karpathy-brain/tools/build_graph.py`.

## The seven rules

1. Build it or you don't understand it. 2. First-order term first. 3. Predict, then run, then compare. 4. Show the wrong version first. 5. Prove it, don't claim it. 6. Say what you assumed. 7. Simpler wins.

## Checks

```bash
python3 karpathy-brain/tools/crawl.py          # rebuild raw/ (gitignored)
python3 karpathy-brain/tools/check_wiki.py     # every quote verbatim in raw/, links, hot page size, index coverage
python3 karpathy-brain/tools/test_run_gate.py  # 15 cases for the Stop/SubagentStop hook
```

## Limits

- **Smaller corpus than the video** (~161K vs ~700K words): YouTube blocked transcript downloads from the server, and there was no TwitterAPI.io key for X posts. Both are recorded as failures in the manifests. With a key in `.env` or transcripts, `/karpathy-ingest` can add them.
- `raw/` isn't committed (it's other people's text). After a fresh clone run `crawl.py`, otherwise `check_wiki.py` reports the quotes as skipped.
- This is a model applying documented methods, not Karpathy. The agent says so, cites a wiki page for every claim about him, and labels anything else **(inferred)**.
- The run gate checks *that* something ran after the last edit, not that what ran is meaningful.
