---
name: video-editing-craft
description: The craft of making any video actually watchable — hooks, retention, pacing/rhythm, and free stock footage/music sourcing — on top of this project's Remotion skills, which cover the mechanics of building a video but not whether it holds attention.
version: 1.0.0
---

Instructions for the directorial/editorial layer of video work: whether a video is paced well and holds attention, independent of the code that assembles it. The Remotion skills already in this project ([remotion-markup](../remotion-markup/SKILL.md), [remotion-create](../remotion-create/SKILL.md), and the rest) cover *how* to build clips, transitions, and effects in code — this skill covers *what makes the result actually good to watch*. Use both together: this skill for the editorial decisions, the Remotion skills for implementing them.

This complements, rather than replaces, [Course Presenter Layout](../course-presenter-layout/SKILL.md) (a specific presenter+content layout pattern) — this skill applies to any video: marketing clips, social/short-form content, trailers, montages, not just courses. Also feed ideation for a video's concept/hook through [Creative Thinking](../creative-thinking/SKILL.md) before locking in the obvious first idea.

## When to use

Any time the deliverable is a video meant to hold an audience's attention, not just convey information correctly — a social/short-form clip, a marketing or product video, a trailer, a montage, or the editorial pass on a course video's pacing once [Course Presenter Layout](../course-presenter-layout/SKILL.md) has the layout sorted. Not needed for a purely functional screen-recording tutorial with no retention pressure (nobody's scrolling away from a documentation video they specifically sought out) — apply judgment to how much of this actually matters for a given video's context.

## Step 1 — Know the format's retention pressure before pacing anything

Different formats have very different tolerance for slow starts or dead time — decide the format first, it changes every pacing decision downstream:

- **Short-form (TikTok/Reels/Shorts, roughly 15-90s)**: near-zero tolerance for a slow start; a viewer can leave in under a second. See [Hooks & Retention](hooks-and-retention.md) — this format needs a genuine hook in the first 1-3 seconds, not a logo/intro/throat-clear.
- **Mid-length (YouTube video, marketing piece, a few minutes)**: still needs an early hook, but has more room to build once attention is secured — the hook can be slightly slower without losing the viewer instantly.
- **Long-form / sought-out content (a full course lesson, a tutorial someone specifically opened)**: retention pressure is lower because the viewer already opted in with intent — pacing should still avoid genuine dead air, but doesn't need short-form's constant micro-hooks.

## Step 2 — Structure for retention

Read [Hooks & Retention](hooks-and-retention.md) for the open-loop hook technique, the hook → promise → payoff shape, and how caption/text overlay choices affect retention independent of the visuals.

## Step 3 — Pacing and rhythm

Read [Pacing & Rhythm](pacing-and-rhythm.md) for cut frequency by format, matching cuts to a beat, using B-roll to cover jump cuts and add visual variety, and shaping a video's energy curve rather than holding one flat intensity throughout. When implementing in Remotion, this is where [ripple editing with `TransitionSeries`](../remotion-markup/video-editing.md#ripple-editing-with-transitionseries) and [transitions](../remotion-markup/transitions.md) do the actual work — decide the rhythm here, then build it there.

## Step 4 — Source assets

Read [Free Assets & Tools](free-assets-and-tools.md) for free stock footage, free music, and free sound-effect libraries — and the licensing caveat that matters before publishing anything commercially or monetized.

## Step 5 — Review against the format's own bar, not a general one

Before calling a cut done, watch it back specifically checking what the intended format actually demands: for short-form, would this survive the first second on a real feed (per [Hooks & Retention](hooks-and-retention.md)); for any format, is there a stretch of genuine dead time (a beat where nothing changes — visually, in the audio, or in the information given) that a viewer could reasonably scroll away during. A video that's technically well-built in Remotion but has 8 seconds of static talking before anything happens has a pacing problem this skill exists to catch, not a code problem.
