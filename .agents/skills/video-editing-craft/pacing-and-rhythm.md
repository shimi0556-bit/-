# Pacing & Rhythm

Pacing is the rate and pattern of change in a video — cuts, motion, information — and it's usually a bigger driver of whether a video feels engaging than any individual shot's quality. A well-shot video with no rhythm still feels slow; a rougher video with good rhythm can still hold attention.

## Cut frequency by format

There's no universal "correct" cut rate — it should match the format's retention pressure (see the main skill's Step 1):
- **Short-form (TikTok/Reels/Shorts)**: a cut roughly every 1.5-3 seconds is a reasonable default for lifestyle/entertainment/educational content — dead time (a shot held with nothing changing) is what loses viewers fastest on this format. Even faster micro-cuts (well under a second) in the opening shots can help "wake up" a scrolling viewer before settling into the main rhythm.
- **Mid-length content**: cuts can breathe more — not every beat needs a cut, but a shot shouldn't run so long that nothing visually or informationally changes for many seconds at a stretch.
- **Long-form / course content**: pacing is about avoiding genuine dead air (a long unbroken static shot with no visual change) more than hitting a specific cut-frequency target — a talking-head shot can run longer if the content itself is carrying interest, but should still be broken up by content-side changes (see [Course Presenter Layout](../course-presenter-layout/SKILL.md) Step 3 on timing content reveals to narration).

Don't apply a short-form cut rate to long-form content or vice versa — an overcut course video feels frantic and hard to follow; an undercut short-form clip feels slow and gets scrolled past.

## Cutting to a beat

When music is present, cutting on (or near) the beat makes an edit feel intentional and energetic even when the underlying content is fairly simple — this is a cheap, high-leverage technique. In Remotion, this means choosing `<TransitionSeries.Sequence>` durations (see [ripple editing](../remotion-markup/video-editing.md#ripple-editing-with-transitionseries)) that land cuts on the track's actual beat timing rather than arbitrary round numbers — identify the beat timing from the audio first, then set clip durations to match, rather than picking durations and hoping they land musically.

## Using B-roll to cover cuts and add variety

B-roll (supplementary footage that isn't the main subject/talking head) does two jobs at once: it covers a jump cut in the main footage (so a trimmed pause doesn't visibly jump), and it adds visual variety that keeps a shot from overstaying its welcome even when the underlying narration continues uninterrupted. A talking-head clip that cuts away to relevant B-roll every several seconds reads as far more dynamic than the same audio played under one unbroken shot of the speaker, even though the information delivered is identical. See [Free Assets & Tools](free-assets-and-tools.md) for sourcing B-roll footage for free.

## Shaping an energy curve, not holding one flat intensity

A video that's uniformly high-energy throughout (constant fast cuts, constant loud music) paradoxically reads as less exciting than one with actual peaks and valleys — without contrast, "high energy" just becomes the new baseline and stops registering as exciting. Deliberately vary pace:
- A hook at peak energy (see [Hooks & Retention](hooks-and-retention.md)).
- A brief relative lull for a key piece of information to land clearly (slightly slower cuts, a beat of visual stillness) — don't be afraid of a short deliberate slow-down if it's serving clarity, as long as it doesn't drift into genuine dead time.
- Escalation back up toward a second peak before the payoff/CTA.

## Visual variety beyond cut timing

Pacing isn't only about cut *frequency* — camera/framing variety (a mix of shot types, not the same framing repeated for the whole video), on-screen text/graphic changes, and audio changes (a music swell, a sound effect on a beat) all read as "something changing" even between hard cuts, and contribute to a video feeling paced rather than static. A video with frequent cuts but zero variety in framing or content between them can still feel monotonous — the frequency alone isn't the whole job.

## Sanity-checking pacing

Watch the edit back at actual speed (not scrubbing through it) and note any point where attention would plausibly wander — that's the practical test that matters more than hitting a specific cut-count target. A cut-frequency guideline is a starting heuristic, not a substitute for actually watching the result.
