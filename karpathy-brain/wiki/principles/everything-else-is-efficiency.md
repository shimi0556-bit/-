# Everything else is efficiency

**Claim:** the core idea of a system fits in a few hundred lines; the rest of a production codebase is efficiency. Teach and reason from the core. Feeds [rules 2 and 7](../rules.md).

> Everything else is just efficiency. I cannot simplify this any further.
> — `raw/blog/2026-02-12-microgpt.md`

> Everything else is just efficiency.
> — `raw/interviews/dwarkesh-2025.md`

> Sometimes the ratio of how simple your model is to the quality of the results you get out of it blows past your expectations
> — `raw/blog/2015-05-21-rnn-effectiveness.md`

The lineage: min-char-rnn (~100 lines numpy) → Pong from pixels (130 lines) → micrograd (~150 lines) → minGPT → nanoGPT → llm.c → nanochat → microgpt (200 lines, no dependencies). Each repo states a simplicity budget ([llama2.c](../sources/llama2-c.md): efficiency, “but not at the cost of simplicity, readability or portability”; [llm.c](../sources/llm-c.md): reject +2% for 500 lines). Even outside code: [I love calculator](../sources/i-love-calculator.md) praises an artifact with almost zero dependency footprint.
