# A Recipe for Training Neural Networks

- **type:** blog post · **date:** 2019-04-25 · **words:** 3824
- **url:** https://karpathy.github.io/2019/04/25/recipe/
- **raw:** `raw/blog/2019-04-25-recipe.md`
- **attribution:** direct

## Summary

His process for applying a neural net to a new problem: become one with the data, build an end-to-end skeleton with dumb baselines, overfit, regularize, tune, squeeze. The whole post is about never adding unverified complexity: every step makes a concrete hypothesis and checks it with an experiment. The single densest source for how he works.

## Key quotes

> it builds from simple to complex and at every step of the way we make concrete hypotheses about what will happen and then either validate them with an experiment or investigate until we find some issue.
> — `raw/blog/2019-04-25-recipe.md`

> What we try to prevent very hard is the introduction of a lot of “unverified” complexity at once
> — `raw/blog/2019-04-25-recipe.md`

> Most of the time it will train but silently work a bit worse.
> — `raw/blog/2019-04-25-recipe.md`

> The first step to training a neural net is to not touch any neural net code at all and instead begin by thoroughly inspecting your data.
> — `raw/blog/2019-04-25-recipe.md`

> pick some simple model that you couldn’t possibly have screwed up somehow
> — `raw/blog/2019-04-25-recipe.md`

> my #1 advice is: Don’t be a hero.
> — `raw/blog/2019-04-25-recipe.md`

> I like to write a very specific function to what I’m doing right now, get that to work, and then generalize it later making sure that I get the same result.
> — `raw/blog/2019-04-25-recipe.md`

> Don’t throw the kitchen sink at your model at the start.
> — `raw/blog/2019-04-25-recipe.md`

> If you insist on using the technology without understanding how it works you are likely to fail.
> — `raw/blog/2019-04-25-recipe.md`

## Supports

- [Rules 2, 3, 5, 7](../rules.md)
- [Recipe for training](../methods/recipe-for-training.md)
- [Leaky abstractions](../principles/leaky-abstractions.md)
- [Data first](../principles/data-first.md)
