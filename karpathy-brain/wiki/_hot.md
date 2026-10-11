# Hot page: how Karpathy thinks (read this first)

Compiled from 58 public sources (blogs 2011–2026, repo READMEs, the 2025 Dwarkesh interview). Everything here is an interpretation; quotes and evidence live in the linked pages. Don't present any of it as his words unless it's a quote from the wiki.

**Core belief: you understand what you can build.** He rebuilds things from scratch (Bitcoin, backprop, GPT, tokenizers) to understand them, and builds a learner's understanding the same way. → [build to understand](principles/build-to-understand.md)

**Find the first-order term.** From physics: a simple approximation explains most of a system. Show the simplest thing working, then add terms one at a time. In code: “Everything else is just efficiency”; microgpt is a full GPT in 200 dependency-free lines. → [first-order terms](principles/first-order-terms.md), [everything else is efficiency](principles/everything-else-is-efficiency.md)

**Never add unverified complexity.** His training recipe: look at the data first, build an end-to-end skeleton with dumb baselines, make a concrete hypothesis before every experiment, change one thing at a time. Neural nets fail silently, so “it ran” proves little. → [recipe](methods/recipe-for-training.md), [leaky abstractions](principles/leaky-abstractions.md), [data first](principles/data-first.md)

**Simplicity is a hard constraint.** “Don’t be a hero”; reject +2% speed for 500 lines; agents that add try/catch everywhere are bloat. → [rules 7](rules.md)

**Teaching is building ramps.** Lay knowledge out so each step depends only on the previous one; present the pain before the solution; make the learner guess first; fight the curse of knowledge; aim for “eurekas per second”. → [ramps to knowledge](methods/ramps-to-knowledge.md), [explain to learn](methods/explain-to-learn.md)

**Distrusts demos.** A 90% demo is the first nine of a long march (Tesla). → [march of nines](principles/march-of-nines.md)

**On AI:** Software 1.0 (code) → 2.0 (weights) → 3.0 (prompts/context). AI automates what is verifiable, hence jagged capability. LLMs are “ghosts”, not animals. His use of coding agents moved from “autocomplete is my sweet spot” (Oct 2025) to delegating larger work (2026), always with someone verifying. → [verifiability](principles/verifiability.md), [ghosts](principles/ghosts-not-animals.md), [software 1/2/3](principles/software-1-2-3.md), [coding with LLMs](methods/coding-with-llms.md)

## The seven rules (details: [rules.md](rules.md))

1. Build it or you don't understand it.
2. First-order term first.
3. Predict, then run, then compare.
4. Show the wrong version first.
5. Prove it, don't claim it.
6. Say what you assumed.
7. Simpler wins.

## Gaps

No YouTube lecture transcripts and no X posts yet (blocked or no API key at crawl time; see `raw/*/manifest.md`). Lecture-specific teaching moves are known only second-hand through the interview, READMEs and lecture notes.
