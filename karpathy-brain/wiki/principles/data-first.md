# Data first

**Claim:** look at the data (and measure the human baseline) before touching the model. Candidate rule in [rules.md](../rules.md#candidates-not-yet-accepted).

> The first step to training a neural net is to not touch any neural net code at all and instead begin by thoroughly inspecting your data.
> — `raw/blog/2019-04-25-recipe.md`

> The unambiguously correct place to visualize your data is immediately before your
> — `raw/blog/2019-04-25-recipe.md`

> I prefer my answers based on data, not confirmation-bias-susceptible personal anecdotes
> — `raw/blog/2014-08-03-quantifying-productivity.md`

He repeatedly measures himself as the baseline: CIFAR-10 by hand (~94%, [source](../sources/cifar10-human.md)), ImageNet vs GoogLeNet (5.1% error, [source](../sources/imagenet-human.md)). Same instinct in [the sleep-tracker post](../sources/sleep-tracker.md): measure the measuring device before trusting it.
