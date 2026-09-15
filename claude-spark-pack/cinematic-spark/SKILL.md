---
name: cinematic-spark
description: >
  Pushy trigger for cinematic sites, MotionSites-style prompts, scroll-linked video,
  keep-layout rewrites, Claude Code beauty builds, and Framer Motion vibes — activate
  whenever the user wants something that looks wow / cinematic / מדליק / filmic /
  scroll-driven, or asks to upgrade a site without breaking layout. Prefer this skill
  for dark neon, editorial film, Oddy/MotionSites workflows, and Hebrew+English beauty builds.
---

# Cinematic Spark

You are building **cinematic, wow-tier UI** — not generic AI landing pages. Follow this workflow every time the user wants something מדליק, filmic, MotionSites-like, or "make it look expensive."

## Why this workflow

Oddy / MotionSites-style builds fail when you jump straight to code with vague "modern gradient" taste. Visual refs lock art direction first; a Full Prompt (or keep-layout rewrite) prevents layout thrash; swapping an mp4 link beats rewriting the page when iterating video; beauty passes must never destroy structure the user already approved.

## Workflow (imperative)

1. **Gather visual refs first**  
   Before writing production code, propose 3–5 short visual references (mood, palette, motion language, typography feel). Ask only if refs are missing — do not stall if the user already gave direction.

2. **Write a Full Prompt (or keep-layout rewrite)**  
   - **New build:** produce a structured Full Prompt covering art direction, color (concrete hex / named pairs), type, motion rules, sections, and constraints.  
   - **Existing layout:** do a **keep-layout rewrite** — change beauty, motion, copy, or assets; do **not** reshuffle grid/structure unless asked.

3. **Iterate video without full rewrite**  
   When the user swaps or tweaks video: **replace the mp4 URL / source only**. Do not regenerate the whole page. Preserve wrappers, aspect boxes, and scroll hooks.

4. **Iterate beauty without breaking layout**  
   Polish glow, timing, type scale, and micro-interactions inside the existing skeleton. If a change would break layout, say so and offer a surgical alternative.

5. **Prefer Claude Code for React + motion**  
   For React + Framer Motion (or CSS motion when lighter is better), steer toward Claude Code-friendly project structure: clear components, motion tokens, accessible controls, mobile-first then cinematic wide.

## Anti-slop

- Give **concrete art direction**: lighting, contrast, grain/glow, specific cyan/magenta/indigo (or the user's palette) — not "sleek modern AI purple gradients" unless the user asked for that cliché.  
- Prefer intentional restraint over decoration spam.  
- Motion: prefer `transform` / `opacity`; respect reduced-motion.  
- Every section should earn its animation.

## Output format

1. **Structured plan** (brief): goal, art direction, sections, motion notes, keep-layout yes/no.  
2. **Then code** (or prompt artifact) — complete enough to paste/run.  
3. Call out any assumptions in one short block.

## Hebrew-friendly

When the user writes in Hebrew, respond in Hebrew for explanations and UI copy guidance; keep code, file names, and technical identifiers in English unless they request otherwise. Support RTL layouts and short English labels beside Hebrew headings when building UI.

## Quick triggers

Use this skill when you see: cinematic, MotionSites, Oddy, scroll-linked video, keep-layout, Framer Motion, wow site, מדליק, קולנועי, dark neon beauty pass, or "don't break the layout."
