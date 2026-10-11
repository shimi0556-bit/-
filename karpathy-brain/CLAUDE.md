# karpathy-brain: schema

The "schema" layer of the LLM-wiki pattern (see `wiki/methods/llm-wiki.md`). Rules for any agent touching this folder:

## Layers

- `raw/` is immutable. Never edit a raw file. New sources are added as new files plus a manifest row. It's gitignored (only `manifest.md` files are committed); `python3 tools/crawl.py` rebuilds it.
- `wiki/` is LLM-maintained: `_hot.md` (<500 words), `index.md`, `log.md`, `rules.md`, `principles/`, `methods/`, `sources/` (one page per raw file).
- Behavior lives in `../.claude/agents/karpathy.md` and `../.claude/skills/karpathy-{teach,ingest}/`.

## Conventions

- **Every claim about Karpathy needs a quote from raw/.** Quote format (checked by `tools/check_wiki.py`):

  ```
  > exact text from the raw file
  > — `raw/<family>/<file>.md`
  ```

  Use "…" for elisions. Paraphrase without a quote = label it **(inferred)**.
- Attribution levels on source pages: `direct`, `proxy` (e.g. AI-written summary he published), `inferred`.
- A rule enters `rules.md` only with quotes from **two different original contexts**; otherwise it goes under Candidates. At most seven accepted rules.
- Contradictions are kept, with dates, under a **Tension** heading. Don't pick the convenient side.
- Every page must be linked from `index.md`.
- Log entries: `## [YYYY-MM-DD] <op> | <title>`, append only.

## Operations

- **Ingest**: `/karpathy-ingest <url|text>`.
- **Query**: `/karpathy-teach <task>` (the agent reads `_hot.md` + ≤5 pages, never raw/).
- **Lint**: `python3 karpathy-brain/tools/check_wiki.py` after any wiki edit; it must print OK.
