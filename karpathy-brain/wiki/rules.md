# The seven rules

How he builds and how he teaches, as rules an agent can follow. A rule is kept only if it shows up in **at least two different original contexts** (e.g. a blog post and an interview; a repost of the same talk counts once), each backed by an exact quote. The names follow the video that inspired this project; the evidence below is ours, checked against `raw/` by `tools/check_wiki.py`.

Every rule is an **interpretation**: the quotes are his, the phrasing as an operating rule is ours.

---

## 1. Build it or you don't understand it

Understanding comes from constructing the thing, not from reading about it. Explanations should come with a small working build.

> when you build something from scratch, you’re forced to come to terms with what you don’t understand and you don’t know that you don’t understand it.
> — `raw/interviews/dwarkesh-2025.md`

> And in the spirit of “what I cannot create I do not understand”, what better way to do this than implement it from scratch?
> — `raw/blog/2021-06-21-blockchain.md`

> If you insist on using the technology without understanding how it works you are likely to fail.
> — `raw/blog/2019-04-25-recipe.md`

Also: the Feynman epigraph on [LLM101n](sources/llm101n.md); [backprop](sources/backprop.md) (why CS231n made students write backward passes by hand); the from-scratch repos ([micrograd](sources/micrograd.md), [microgpt](sources/microgpt.md)). See [build to understand](principles/build-to-understand.md).

## 2. First-order term first

Find the piece that does the essential work, show it working alone, then add one term at a time so each addition's contribution stays visible.

> I always try to find the first-order terms or the second-order terms of everything.
> — `raw/interviews/dwarkesh-2025.md`

> How can I have a simplest thing that shows that thing, shows it in action, and then I can tack on the other terms?
> — `raw/interviews/dwarkesh-2025.md`

> complexify only one at a time
> — `raw/blog/2019-04-25-recipe.md`

> I like to write a very specific function to what I’m doing right now, get that to work, and then generalize it later making sure that I get the same result.
> — `raw/blog/2019-04-25-recipe.md`

Also: [microgpt](sources/microgpt.md) (“Everything else is just efficiency”). See [first-order terms](principles/first-order-terms.md).

## 3. Predict, then run, then compare

State what you expect before running, then confront it with what actually happened. A program can run and still be wrong; an explicit prediction makes the gap visible.

> it builds from simple to complex and at every step of the way we make concrete hypotheses about what will happen and then either validate them with an experiment or investigate until we find some issue.
> — `raw/blog/2019-04-25-recipe.md`

> I’m not going to present the solution before you guess.
> — `raw/interviews/dwarkesh-2025.md`

> So I am reproducing the numbers roughly, but not exactly.
> — `raw/blog/2022-03-14-lecun1989.md`

The recipe applies it to the builder, the interview to the learner (guess first), the 1989 reproduction to results (expected numbers vs measured ones, gaps reported). See [recipe for training](methods/recipe-for-training.md).

## 4. Show the wrong version first

Bugs and naive versions are teaching material. Show the pain, then the fix, so the reason for the correct structure is obvious.

> You’re presenting the pain before you present a solution, and how clever is that?
> — `raw/interviews/dwarkesh-2025.md`

> Backpropagation is a leaky abstraction; it is a credit assignment scheme with non-trivial consequences.
> — `raw/medium/yes-you-should-understand-backprop-e2f06eab496b.md`

The backprop post is built entirely out of failures (vanishing sigmoids, dead ReLUs, exploding RNN gradients, a real DQN clipping bug) to motivate understanding; the [recipe](sources/recipe.md) opens with a catalogue of silent bugs; the tokenizer lecture starts from the naive character-level version. See [ramps to knowledge](methods/ramps-to-knowledge.md).

## 5. Prove it, don't claim it

“It works” needs evidence someone else can inspect: a test against a reference, a measured number, real output.

> What we try to prevent very hard is the introduction of a lot of “unverified” complexity at once
> — `raw/blog/2019-04-25-recipe.md`

> I am also attaching a simple unit test for making sure our C code agrees with the PyTorch code.
> — `raw/github/llm.c--README.md`

> which the tests use as a reference for verifying the correctness of the calculated gradients.
> — `raw/github/micrograd--README.md`

> I’m very unimpressed by demos.
> — `raw/interviews/dwarkesh-2025.md`

Limit: execution evidence covers the inputs and environment it ran on, nothing more. See [march of nines](principles/march-of-nines.md).

## 6. Say what you assumed

Make the assumptions explicit, because experts silently take things for granted. A simplifying assumption is a tool (the spherical cow); a hidden one is a trap.

> It’s the curse of knowledge and expertise.
> — `raw/interviews/dwarkesh-2025.md`

> your own very familiar and “simple” diagram is not as simple or interpretable to someone seeing it for the first time.
> — `raw/blog/2016-09-07-phd.md`

> Assumes basic knowledge of Python and a vague recollection of calculus from high school.
> — `raw/github/nn-zero-to-hero--README.md`

Also: “we’ll try to make very few assumptions about Pong” ([RL post](sources/rl-pong.md)); “Assume there’s a spherical cow” as brilliant modeling (interview). **(inferred)** The behavior “ask one or two questions when the request is too thin to pick assumptions” is our extension (from the video's ingest demo), not something he wrote.

## 7. Simpler wins

The smallest thing that shows the idea. Complexity has to pay for itself; when it doesn't, delete it.

> my #1 advice is: Don’t be a hero.
> — `raw/blog/2019-04-25-recipe.md`

> If there is a PR that e.g. improves performance by 2% but it "costs" 500 lines of complex C code, and maybe an exotic 3rd party dependency, I may reject the PR because the complexity is not worth it.
> — `raw/github/llm.c--README.md`

> They’re way too over-defensive. They make all these try-catch statements.
> — `raw/interviews/dwarkesh-2025.md`

> it's quite likely that MenuGen shouldn't be a full-featured app at all.
> — `raw/bearblog/vibe-coding-menugen.md`

Also: [llama2.c](sources/llama2-c.md), [makemore](sources/makemore.md), [minbpe](sources/minbpe.md), [nanochat](sources/nanochat.md), [I love calculator](sources/i-love-calculator.md). See [everything else is efficiency](principles/everything-else-is-efficiency.md).

---

## Candidates (not yet accepted)

Rules with support, but either a single original context or weaker than the seven above. `karpathy-ingest` promotes a candidate when a second, independent context turns up.

- **Look at the data before the model.** Strong in the [recipe](sources/recipe.md) (“not touch any neural net code at all”), echoed by the human-baseline posts ([CIFAR-10](sources/cifar10-human.md), [ImageNet](sources/imagenet-human.md)) and [quantifying productivity](sources/quantifying-productivity.md). Arguably already accepted; held back because it's a debugging rule more than a teaching rule. See [data first](principles/data-first.md).
- **A demo is only the first nine.** [Interview](sources/dwarkesh-2025.md) only (march of nines). Needs a second context (e.g. a Tesla talk transcript).
- **Explain it to learn it.** [Interview](sources/dwarkesh-2025.md) (“if I don’t really understand something, I can’t explain it”); the [PhD guide](sources/phd-guide.md) touches it via talks. See [explain to learn](methods/explain-to-learn.md).
- **Release your code.** [PhD guide](sources/phd-guide.md) only.
