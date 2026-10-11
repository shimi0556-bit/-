# LLM wiki

The pattern from his [gist](../sources/llm-wiki-gist.md), and the structure of this whole folder:

- **raw/**: immutable sources (here: `karpathy-brain/raw/`, gitignored, rebuilt by `tools/crawl.py`).
- **wiki/**: written and maintained by the LLM (this folder).
- **schema**: `karpathy-brain/CLAUDE.md`.
- Operations: **ingest** (`/karpathy-ingest`), **query** (the `karpathy` agent reads `_hot.md` + ≤5 pages), **lint** (`tools/check_wiki.py`).

> the wiki is a persistent, compounding artifact.
> — `raw/gists/llm-wiki.md`

> You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it.
> — `raw/gists/llm-wiki.md`

