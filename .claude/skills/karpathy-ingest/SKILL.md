---
name: karpathy-ingest
description: Add a new Karpathy source (blog post, X post, repo README, talk transcript, or a pasted text) to karpathy-brain - save it raw, write its wiki source page, update the principles/methods/rules it supports or contradicts, then the index, the hot page and the log. Use for "/karpathy-ingest <url or text>", "add this Karpathy post to the brain", "תוסיף את הפוסט הזה של קרפתי למוח".
---

# karpathy-ingest

Usage: `/karpathy-ingest <url | file path | pasted text>`

Follows the "Ingest" operation of the LLM-wiki pattern (`karpathy-brain/wiki/sources/llm-wiki-gist.md`). The wiki's conventions are in `karpathy-brain/CLAUDE.md`; read it first.

## Steps

1. **Duplicate check.** Search `karpathy-brain/raw/*/manifest.md` and `karpathy-brain/wiki/sources/` for the URL or title. If it's already there, say so and stop unless the user wants a refresh.
2. **Save raw, unchanged.** Fetch the text (curl/WebFetch; for X posts use a TwitterAPI.io key from `.env` if one exists, otherwise ask the user to paste the text). Write it to `karpathy-brain/raw/<family>/<slug>.md` with a first line `source: <url>`, and add a row (file, word count, source) to that family's `manifest.md`. Never edit existing raw files.
3. **Source page.** Create `karpathy-brain/wiki/sources/<slug>.md` in the same format as the other source pages: metadata, 3-6 line summary, key quotes (exact, copied from the raw file), and "Supports" links to principle/method/rule pages.
4. **Update affected pages.** For every principle, method or rule the source touches: add the quote and a link back. If it contradicts an existing claim, write both down with dates under a `Tensions` heading instead of picking one.
5. **Promotion check.** A candidate rule in `rules.md` → "Candidates" moves into the accepted set only once it has quotes from **two different original contexts** (a repost or transcript of the same talk counts once). Never more than the strongest seven accepted rules; if a new rule beats one, explain the swap.
6. **Bookkeeping.** Update `index.md`, refresh `_hot.md` if the summary of how he thinks changed (keep it under 500 words), and append to `log.md`: `## [YYYY-MM-DD] ingest | <title>` plus 1-3 lines of what changed.
7. **Verify.** Run `python3 karpathy-brain/tools/check_wiki.py`. It must pass (every quote found verbatim in raw/, no broken links, hot page < 500 words) before you report done.

Report: what was added, which pages changed, any rule promoted, and the checker's output.
