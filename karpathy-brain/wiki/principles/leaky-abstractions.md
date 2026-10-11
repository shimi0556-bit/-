# Leaky abstractions and silent failure

**Claim:** neural-net tooling looks like plug-and-play APIs but isn't; errors don't raise, they quietly make results a bit worse. So you must understand what's under the abstraction and verify each step. Feeds [rules 1, 4, 5](../rules.md).

> Backpropagation is a leaky abstraction; it is a credit assignment scheme with non-trivial consequences.
> — `raw/medium/yes-you-should-understand-backprop-e2f06eab496b.md`

> Most of the time it will train but silently work a bit worse.
> — `raw/blog/2019-04-25-recipe.md`

Practical consequence for an agent: “it ran without errors” is weak evidence. Compare against a reference, a known value (e.g. loss at init = -log(1/n_classes)), or a prediction.
