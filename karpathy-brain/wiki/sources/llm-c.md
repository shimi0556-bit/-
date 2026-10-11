# llm.c (README)

- **type:** repo README · **date:** fetched 2026-10-11 · **words:** 2280
- **url:** https://github.com/karpathy/llm.c/blob/HEAD/README.md
- **raw:** `raw/github/llm.c--README.md`
- **attribution:** direct

## Summary

LLM training in plain C/CUDA with a parallel PyTorch reference; a unit test checks the C code matches PyTorch. Explicit policy of rejecting complexity that doesn't pay for itself.

## Key quotes

> I am also attaching a simple unit test for making sure our C code agrees with the PyTorch code.
> — `raw/github/llm.c--README.md`

> If there is a PR that e.g. improves performance by 2% but it "costs" 500 lines of complex C code, and maybe an exotic 3rd party dependency, I may reject the PR because the complexity is not worth it.
> — `raw/github/llm.c--README.md`

## Supports

- [Rules 5, 7](../rules.md)
- [Everything else is efficiency](../principles/everything-else-is-efficiency.md)
