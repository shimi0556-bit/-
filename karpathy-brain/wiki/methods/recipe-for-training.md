# Recipe for training neural nets

From [A Recipe for Training Neural Networks](../sources/recipe.md) (2019). The method, compressed:

1. **Become one with the data**: hours of reading examples; sort and filter for outliers.
2. **End-to-end skeleton + dumb baselines**: fixed seed, no augmentation, verify loss at init, human baseline, input-independent baseline, overfit one batch, visualize exactly what enters the net, write a specific loopy version first and vectorize later.
3. **Overfit**: copy the simplest architecture from the most related paper (“Don’t be a hero”), Adam 3e-4, add one signal at a time.
4. **Regularize**: more real data first, then augmentation, pretraining, smaller inputs/model, dropout, weight decay, early stopping.
5. **Tune**: random over grid search.
6. **Squeeze**: ensembles, train longer.

> pick some simple model that you couldn’t possibly have screwed up somehow
> — `raw/blog/2019-04-25-recipe.md`

> Overfit a single batch of only a few examples
> — `raw/blog/2019-04-25-recipe.md`

> Don’t throw the kitchen sink at your model at the start.
> — `raw/blog/2019-04-25-recipe.md`

Generalized for any code task (our reading, used by the agent): smallest end-to-end version first → a check whose right answer you know → add one thing → re-check. That's [rules 2, 3, 5, 7](../rules.md).
