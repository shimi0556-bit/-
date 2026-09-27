# Avoiding the Default

The specific failure mode this skill counters: reaching for the response that's most statistically probable given the prompt, which reads as competent and relevant but not actually chosen. This file is about recognizing that pull in the moment, across any creative domain — not just visual design, where it's already documented concretely (see the note at the bottom).

## What the pull toward "the average" looks like in practice

- The first concept that comes to mind matches what several other people asked the same question would also produce independently — that's not a coincidence, it's the average of the training distribution for that kind of prompt.
- A description that could apply to many different projects in the same category with only the proper nouns changed — a generic "chosen one saves the kingdom" story, a "clean, minimal, modern" design brief that says nothing specific about *this* subject.
- Reaching for the most common trope in a genre first (the dark lord, the wise mentor, the plucky sidekick; the gradient hero, the rounded card, the centered layout) because it's the most represented pattern, not because it's the best fit for this particular piece of work.
- Vocabulary that's safe and broadly applicable rather than specific to the actual subject — "innovative," "seamless," "elevate," "unlock" — versus words that could only describe this exact thing.

None of these are wrong in isolation — the average answer is usually competent. The problem is only that it's a default, not a decision, and a request for something creative is implicitly a request for a decision.

## Countermeasures

- **Name the cliché before avoiding it.** Explicitly state what the "obvious" version of this idea would be, in one sentence, before generating alternatives — this makes the default visible and easy to deliberately steer away from, rather than unconsciously drifting back toward it.
- **Ground in the specific subject's own material.** Pull concrete, specific details from the actual subject (its real terminology, its real constraints, its real texture) rather than generic descriptors — a detail only this subject could have is very hard to accidentally produce by defaulting to the average.
- **State constraints and what NOT to do up front**, not just what's wanted — a boundary narrows the solution space away from the broadest, most average region of it. "Not a chosen-one story," "no gradient hero," "no dark-lord antagonist" are more useful steering than restating the positive brief alone.
- **Generate several genuinely different options before committing** (see [Divergence Techniques](divergence-techniques.md)) — the average answer is likeliest to show up first; later, more effortful options are where distinctive ideas tend to live.
- **Prefer the specific claim over the safe claim** when two ideas are otherwise similarly strong — a more specific, more opinionated idea that could be wrong is usually more interesting than a vaguer one that's hard to object to.

## The visual-design case, as a worked example

The `artifact-design` skill (invoked via the Skill tool when authoring an Artifact, not a file in this repo) already names a concrete cluster of AI-generated-look defaults to avoid on sight: warm cream background with a serif display face and a terracotta accent; near-black with one acid-green or vermilion pop; broadsheet hairline rules with dense columns; a purple-to-blue gradient hero on white; Inter or Space Grotesk as the "safe" typeface; emoji as section markers; everything centered; `rounded-lg` on every card; an accent bar on rounded cards. That list exists because visual design has been observed converging on those specific patterns — it's the same phenomenon this skill addresses generally, just already catalogued for one domain. The technique that produced that list — noticing what a whole category of outputs keeps defaulting to, then naming it explicitly so it can be deliberately avoided — is the technique to apply in any other domain that doesn't yet have its own such list (naming, game concepts, story premises, and so on): notice the pattern, name it, then choose something else on purpose.

## This isn't about being weird for its own sake

Avoiding the default doesn't mean picking the strangest available option — a deliberately bizarre choice that doesn't serve the actual work is just a different kind of unconsidered default (the "look how creative I am" default). The goal is a choice that's specific to *this* piece of work and could be defended with a reason beyond "it's what usually goes here" — sometimes that reasoned choice turns out to be closer to a familiar pattern than expected, and that's fine, as long as it was actually chosen rather than defaulted to.
