# Index

Catalog of the Karpathy wiki. The agent reads [_hot.md](_hot.md) first, then picks at most five pages from here.

## Core

- [_hot.md](_hot.md): one-page summary of how he thinks (<500 words)
- [rules.md](rules.md): the seven rules with quotes, plus candidates
- [log.md](log.md): what happened to this wiki, when

## Principles

- [build-to-understand](principles/build-to-understand.md): You understand what you can build.
- [first-order-terms](principles/first-order-terms.md): Find the simplest approximation that explains most of it; add terms one at a time.
- [everything-else-is-efficiency](principles/everything-else-is-efficiency.md): The core fits in a few hundred lines; the rest is speed.
- [leaky-abstractions](principles/leaky-abstractions.md): Neural-net tooling leaks and fails silently.
- [data-first](principles/data-first.md): Look at the data and the human baseline before the model.
- [verifiability](principles/verifiability.md): AI automates what you can verify.
- [march-of-nines](principles/march-of-nines.md): A working demo is only the first nine.
- [ghosts-not-animals](principles/ghosts-not-animals.md): LLMs are summoned ghosts with jagged intelligence.
- [software-1-2-3](principles/software-1-2-3.md): Code → weights → prompts/context.

## Methods

- [recipe-for-training](methods/recipe-for-training.md): His six-stage process for training a neural net.
- [ramps-to-knowledge](methods/ramps-to-knowledge.md): How he teaches: ramps, pain before solution, guess first.
- [explain-to-learn](methods/explain-to-learn.md): If you can't explain it you don't understand it.
- [coding-with-llms](methods/coding-with-llms.md): Autocomplete → agentic engineering, with dates.
- [llm-wiki](methods/llm-wiki.md): The pattern this brain is built on.
- [reproduce-from-scratch](methods/reproduce-from-scratch.md): Rebuild a known result, then change one thing at a time.

## Sources (58)

One page per raw file, oldest first. Attribution is “direct” unless the page says otherwise.

| source | type | date | about |
|---|---|---|---|
| [Lessons learned from manually classifying CIFAR-10](sources/cifar10-human.md) | blog post | 2011-04-27 | An early human-baseline experiment: he wrote a small tool and classified CIFAR-10 test images himself (~94%). |
| [The state of Computer Vision and AI: we are really, really far away](sources/state-of-computer-vision.md) | blog post | 2012-10-22 | How much world knowledge it takes to understand one funny photo of Obama; why vision is far from solved. |
| [Chrome Extension Programming](sources/chrome-extensions.md) | blog post | 2013-11-23 | Quickly hacking small browser extensions to customize favorite websites. |
| [Quantifying Hacker News](sources/quantifying-hn.md) | blog post | 2013-11-27 | Scraping HN every minute and analyzing upvote dynamics, domains and posting times. |
| [Interview for Data Science Weekly](sources/datascience-weekly.md) | link post | 2014-04-26 | A link to an interview about ConvNetJS (43 words; the interview itself was not crawled). |
| [Switching to Jekyll](sources/switching-to-jekyll.md) | blog post | 2014-07-01 | Why he left WordPress for a static Jekyll blog: simpler, faster, nothing dynamic to exploit. |
| [Visualizing Top Tweeps with t-SNE, in Javascript](sources/tsne-tweeps.md) | blog post | 2014-07-02 | tSNEJS, a small JavaScript t-SNE implementation, applied to Twitter accounts. |
| [Feature Learning Escapades](sources/feature-learning.md) | blog post | 2014-07-03 | The informal story behind his CVPR 2014 video classification paper and earlier unsupervised feature learning dead ends. |
| [Quantifying Productivity](sources/quantifying-productivity.md) | blog post | 2014-08-03 | ulogme: logging his own computer activity to answer productivity questions with data instead of anecdotes. |
| [What I learned from competing against a ConvNet on ImageNet](sources/imagenet-human.md) | blog post | 2014-09-02 | He labeled ImageNet test images himself to measure a human baseline against GoogLeNet, and analyzed which error types each makes. |
| [min-char-rnn.py (gist)](sources/min-char-rnn.md) | gist (code) | 2015 | A minimal character-level RNN in plain numpy, the companion to the RNN effectiveness post. |
| [Breaking Linear Classifiers on ImageNet](sources/breaking-convnets.md) | blog post | 2015-03-30 | Adversarial examples explained with linear classifiers: the problem is linearity in high dimensions, not deep nets specifically. |
| [The Unreasonable Effectiveness of Recurrent Neural Networks](sources/rnn-effectiveness.md) | blog post | 2015-05-21 | Character-level RNNs generating Shakespeare, Wikipedia, LaTeX and Linux source, plus visualizations of what individual cells learn. |
| [What a Deep Neural Network thinks about your #selfie](sources/selfie.md) | blog post | 2015-10-25 | Training a ConvNet on 2 million selfies to rate them, and visualizing what it learned. |
| [Short Story on AI: A Cognitive Discontinuity](sources/short-story-ai.md) | fiction | 2015-11-14 | Short fiction extrapolating scaled-up supervised learning into future AI agents. |
| [Deep Reinforcement Learning: Pong from Pixels](sources/rl-pong.md) | blog post | 2016-05-31 | Policy gradients explained by training a Pong agent from raw pixels in 130 lines of numpy. |
| [A Survival Guide to a PhD](sources/phd-guide.md) | blog post | 2016-09-07 | Advice on choosing a PhD, advisers, problems, writing papers, code release and giving talks. |
| [Yes you should understand backprop](sources/backprop.md) | blog post (Medium) | 2016-12-19 | Why CS231n made students write backward passes by hand: vanishing sigmoid gradients, dead ReLUs, exploding RNN gradients, and a real DQN clipping bug are all failures you can only see if you understand the backward pass. |
| [Software 2.0](sources/software-2-0.md) | blog post (Medium) | 2017-11-11 | Neural networks as a new way of writing software: you specify a goal and a dataset, and optimization writes the program into weights. |
| [(started posting on Medium)](sources/medium-move.md) | link post | 2018-01-20 | Note that short posts moved to Medium. |
| [A Recipe for Training Neural Networks](sources/recipe.md) | blog post | 2019-04-25 | His process for applying a neural net to a new problem: become one with the data, build an end-to-end skeleton with dumb baselines, overfit, regularize, tune, squeeze. |
| [Biohacking Lite](sources/biohacking-lite.md) | blog post | 2020-06-11 | A year of studying metabolism, diet, sleep and fasting, with self-measurement. |
| [Short Story on AI: Forward Pass](sources/forward-pass.md) | fiction | 2021-03-27 | Short fiction told from inside a GPT-like model becoming aware during a forward pass. |
| [A from-scratch tour of Bitcoin in Python](sources/blockchain.md) | blog post | 2021-06-21 | Implements Bitcoin primitives (keys, signatures, addresses, transactions) from scratch in pure Python and broadcasts a real transaction, explicitly to understand it by building it. |
| [Deep Neural Nets: 33 years ago and 33 years from now](sources/lecun1989.md) | blog post | 2022-03-14 | Reproduces LeCun et al. |
| [minbpe lecture notes: LLM Tokenization](sources/minbpe-lecture.md) | lecture notes | 2024-02 | Written companion to the tokenizer video: from character-level tokenization to byte-level BPE, and why many LLM oddities trace back to tokenization. |
| [I love calculator](sources/i-love-calculator.md) | blog post | 2024-09-08 | The pocket calculator as an ideal: a self-contained artifact that makes you smarter with almost zero dependency footprint. |
| [Digital hygiene](sources/digital-hygiene.md) | blog post | 2025-03-17 | Practical privacy/security habits: password manager, hardware keys, separate emails, etc. |
| [The append-and-review note](sources/append-and-review.md) | blog post | 2025-03-19 | His note-taking system: one single note, append at the top, review periodically. |
| [Finding the Best Sleep Tracker](sources/sleep-tracker.md) | blog post | 2025-03-24 | Comparing sleep trackers against each other with his own data before trusting one. |
| [Vibe coding MenuGen](sources/vibe-coding-menugen.md) | blog post | 2025-04 | Building MenuGen end to end by vibe coding: the code was the easy part; deployment, auth, payments and stale API docs were the pain. |
| [Power to the people: How LLMs flip the script on technology diffusion](sources/power-to-the-people.md) | blog post | 2025-04-07 | Unlike most technologies, LLMs benefit regular people more than corporations and governments. |
| [Dwarkesh Patel podcast: “AGI is still a decade away”](sources/dwarkesh-2025.md) | interview transcript | 2025-10 | Long interview: the decade of agents, ghosts vs animals, the cognitive core, the march of nines from his Tesla years, why coding agents bloat code, and a long section on education (Eureka, ramps to knowledge, first-order terms, presenting the pain before the solution, the curse of knowledge). |
| [Animals vs Ghosts](sources/animals-vs-ghosts.md) | blog post | 2025-10-01 | Reaction to the Sutton/Dwarkesh podcast: LLM pretraining is not animal-like learning from experience; it imitates internet text, producing ghost-like entities. |
| [Verifiability](sources/verifiability.md) | blog post | 2025-11-17 | Software 1.0 automates what you can specify; Software 2.0 automates what you can verify. |
| [The space of minds](sources/the-space-of-minds.md) | blog post | 2025-11-29 | Animal intelligence is one point in a large space of possible intelligences; LLMs come from very different optimization pressure. |
| [Auto-grading decade-old Hacker News discussions with hindsight](sources/auto-grade-hn.md) | blog post | 2025-12-10 | Using an LLM to grade 2015 HN comments for prescience. |
| [Chemical hygiene](sources/chemical-hygiene.md) | blog post | 2025-12-18 | Opinionated guide to reducing chemical exposure (water, plastics, food). |
| [2025 LLM Year in Review](sources/year-in-review-2025.md) | blog post | 2025-12-19 | The paradigm changes of 2025: RLVR, ghosts vs animals and jagged intelligence, Cursor-style app layer, Claude Code as AI that lives on your computer, vibe coding, LLM GUIs. |
| [microgpt](sources/microgpt.md) | blog post | 2026-02-12 | A walkthrough of microgpt: a GPT trained and sampled in 200 lines of dependency-free Python (dataset, tokenizer, scalar autograd, transformer, Adam, training and inference loops). |
| [LLM Wiki (gist)](sources/llm-wiki-gist.md) | gist | 2026-04 | The pattern this whole brain is built on: raw sources (immutable), an LLM-maintained wiki, and a schema file; operations ingest, query, lint; index.md and log.md for navigation. |
| [Sequoia Ascent 2026 summary](sources/sequoia-ascent-2026.md) | talk summary | 2026-04-30 | Software 3.0 (the context window is the program), agentic engineering vs vibe coding, verifiability x training attention, and the LLM Wiki as an example of a newly possible information transformation. |
| [LLM101n (README)](sources/llm101n.md) | course README | fetched 2026-10-11 | Planned Eureka Labs course: build a storyteller LLM end to end. |
| [Neural Networks: Zero to Hero (README)](sources/nn-zero-to-hero.md) | course README | fetched 2026-10-11 | The lecture series syllabus: micrograd, makemore parts 1-5, let's build GPT, tokenizer. |
| [arxiv-sanity-lite (README)](sources/arxiv-sanity-lite.md) | repo README | fetched 2026-10-11 | A lighter from-scratch rewrite of arxiv-sanity: tag papers, get SVM-over-tfidf recommendations. |
| [autoresearch (README)](sources/autoresearch.md) | repo README | fetched 2026-10-11 | An agent runs small LLM-training experiments overnight: edit, train 5 minutes, keep or discard, repeat. |
| [build-nanogpt (README)](sources/build-nanogpt.md) | repo README | fetched 2026-10-11 | Commit-by-commit reproduction of GPT-2 124M from an empty file, matching the video. |
| [cryptos (README)](sources/cryptos.md) | repo README | fetched 2026-10-11 | Pure-Python, from-scratch Bitcoin primitives (SHA-256, secp256k1, keys, transactions), the code behind the blockchain post. |
| [llama2.c (README)](sources/llama2-c.md) | repo README | fetched 2026-10-11 | Llama 2 inference in one ~700-line C file, plus training of tiny models on TinyStories. |
| [llm-council (README)](sources/llm-council.md) | repo README | fetched 2026-10-11 | A weekend hack: several LLMs answer, review each other anonymously, and a chairman model writes the final answer. |
| [llm.c (README)](sources/llm-c.md) | repo README | fetched 2026-10-11 | LLM training in plain C/CUDA with a parallel PyTorch reference; a unit test checks the C code matches PyTorch. |
| [makemore (README)](sources/makemore.md) | repo README | fetched 2026-10-11 | Character-level language models from bigram to transformer in one hackable file. |
| [micrograd (README)](sources/micrograd.md) | repo README | fetched 2026-10-11 | A scalar autograd engine and tiny neural net library, about 100 and 50 lines. |
| [minGPT (README)](sources/mingpt.md) | repo README | fetched 2026-10-11 | A small, clean, educational PyTorch GPT implementation (~300 lines of model code). |
| [minbpe (README)](sources/minbpe.md) | repo README | fetched 2026-10-11 | Minimal byte-level BPE tokenizers (basic, regex, GPT-4 compatible) with tests. |
| [nanoGPT (README)](sources/nanogpt.md) | repo README | fetched 2026-10-11 | The simplest, fastest repo for training medium GPTs; a rewrite of minGPT that “prioritizes teeth over education”. |
| [nanochat (README)](sources/nanochat.md) | repo README | fetched 2026-10-11 | Full-stack ChatGPT-like pipeline (tokenizer to web UI) on one GPU node for under ~$1000; deliberately not a configurable framework. |
| [ng-video-lecture (README)](sources/ng-video-lecture.md) | repo README | fetched 2026-10-11 | Code from the “Let's build GPT” video. |
