---
name: course-presenter-layout
description: Compose a rendered MP4 course video where a presenter talks (real webcam footage or an AI avatar) while on-screen content — slides, code, diagrams — plays alongside them, using Remotion.
version: 1.0.0
---

Instructions for building narrated course videos in the "presenter talks, content plays alongside" format (the standard tutorial/course-video layout) and rendering them to a finished MP4. This composes on top of the Remotion skills already set up in this project — it does not replace them.

If a Remotion project doesn't exist yet, first follow [Remotion Create](../remotion-create/SKILL.md) to scaffold one.

## When to use

Any time the deliverable is a finished course/tutorial video file (MP4) that shows a talking presenter next to or overlaid on content the presenter is narrating — a code walkthrough, a slide deck, a product demo, a diagram explanation. Not for a live/interactive teaching page (that would be an Artifact instead) — this is specifically for a rendered video file.

## Step 1 — Decide the presenter source

There are two ways to get the "presenter talking" footage, and they can be mixed lesson-by-lesson in the same course. Read [Presenter Source](presenter-source.md) before recording or generating anything — it covers:
- Recording real webcam footage (free, your own voice/face) and cleaning it up (background removal, framing) before it enters Remotion.
- Generating an AI avatar narrating a script (HeyGen HyperFrames or similar) when there's no real recording, including the free-tier limits worth knowing before planning a whole course around it.

Whichever source is used, the result is the same from Remotion's point of view: an MP4 (or WebM) file with the presenter talking, ready to place in a layout.

## Step 2 — Pick a layout pattern

Read [Layout Patterns](layout-patterns.md) for the concrete Remotion (`<Video>` from `@remotion/media`, `<Sequence>`, `<AbsoluteFill>`) code for each pattern:

- **Side panel** — presenter occupies a fixed strip (e.g. right third) for the whole lesson, content fills the rest. Best default for code-heavy or text-heavy lessons where the content needs real width.
- **Corner picture-in-picture** — presenter in a small circular or rounded box in a corner, content fills the frame. Best when the content itself (a demo, a diagram) needs full attention and the presenter is a supporting presence.
- **Full presenter cutaway** — presenter fills the frame alone for intros/outros/emphasis beats, then transitions to a content layout. Good for hooking attention at the start of a lesson before settling into the working layout.
- **Split-screen sync** — presenter and content each get roughly half the frame, useful for a "here's what I'm doing and here's why" explanation style rather than a long demo.

Pick one pattern as the lesson's default and stay consistent within a lesson — switching layout constantly is more distracting than useful. It's fine for different patterns to open/close a lesson (cutaway intro → side panel body → cutaway outro).

## Step 3 — Build the content side

The content area is regular Remotion content — treat it like any other composition and follow the existing skills for it:
- Code walkthroughs, text reveals, and general on-screen content: [Remotion Markup Best Practices](../remotion-markup/SKILL.md).
- Multi-scene lesson structure (intro → content → recap): [Multi-scene videos](../remotion-markup/multi-scene-video.md).
- Diagrams, maps, or 3D: [Remotion Maps](../remotion-maps/SKILL.md) or [3D](../remotion-markup/3d.md) as relevant.

Time the content's reveals (a bullet appearing, a line of code highlighting) to match what the presenter is saying at that moment — read the presenter audio's timing (or the script's timestamps, if generated alongside an AI avatar narration) rather than guessing durations, so content changes land on the beat of the narration instead of arbitrarily.

## Step 4 — Captions

Course videos are commonly watched muted or by non-native speakers — captions meaningfully extend reach for very little extra cost once the presenter audio exists. Follow [Remotion Captions](../remotion-captions/SKILL.md) to transcribe and display them, positioned so they don't collide with the presenter panel or important content (usually bottom-safe, clear of a bottom-corner PiP).

## Step 5 — Render

Follow [Remotion Render](../remotion-render/SKILL.md) to export the final MP4. For a multi-lesson course, render one file per lesson rather than one enormous composition — easier to fix/re-render a single lesson later without re-rendering the whole course.

## Common pitfalls

- Presenter footage and content both animating heavily at the same time — competes for attention; let one lead while the other is calmer (see [Restraint between the two sides](layout-patterns.md#restraint-between-the-two-sides)).
- PiP presenter panel covering exactly the part of the content being pointed at (a code line, a diagram detail) — check overlap for every content layout, not just the default frame.
- No captions, or captions overlapping the presenter panel or content.
- Recording (or generating) a full course of presenter footage before the content side has even a rough draft — build one lesson end-to-end first (presenter + content + captions + render) to validate the pattern before producing footage for the rest.
