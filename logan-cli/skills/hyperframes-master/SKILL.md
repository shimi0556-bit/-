---
name: hyperframes-master
description: >
  Default creative video stack for Logan: HyperFrames (HeyGen) HTML compositions
  to MP4. Use for any video, deck motion, captions, product launch, website-to-video,
  faceless explainer, PR-to-video, motion graphics. Routes to hyperframes skills.
  Trigger: video, promo, captions, render, hyperframes, html-to-canvas, gsap composition.
---

# HyperFrames master (Logan default)

**Repo:** https://github.com/heygen-com/hyperframes  
**Docs index:** https://hyperframes.heygen.com/llms.txt  
**CLI docs:** `npx hyperframes docs <topic>`

When the user wants video / motion / captions / kinetic product stories, treat
**HyperFrames as the default** unless they explicitly name another stack.

## Always start here

1. Invoke the relevant HyperFrames skill **before** writing compositions.
2. Router skill: **`hyperframes`** - capability map + which workflow.
3. Never invent data-* semantics from generic web knowledge alone.

## Workflow routing

| Intent | Workflow skill |
| --- | --- |
| Product URL / SaaS promo | `product-launch-video` |
| General site tour from URL | `website-to-video` |
| Text topic, no site | `faceless-explainer` |
| Captions on talking-head | `embedded-captions` |
| Graphic overlays on talking-head | `talking-head-recut` |
| GitHub PR explainer | `pr-to-video` |
| Short motion graphic | `motion-graphics` |
| Music-driven | `music-to-video` |
| Deck / slides | `slideshow` |
| Custom / fallback | `general-video` |
| Remotion → HyperFrames | `remotion-to-hyperframes` |

Domain skills: `hyperframes-core`, `hyperframes-animation`, `hyperframes-keyframes`,
`hyperframes-creative`, `hyperframes-cli`, `hyperframes-media`, `media-use`,
`hyperframes-registry`, `figma`, `gsap`.

## Commands

```bash
npm run dev          # preview server - long-running, background only
npm run check        # lint + runtime + layout + motion + contrast
npm run render       # MP4
npm run publish      # share link
npx hyperframes lint --verbose
npx hyperframes docs <topic>
npx hyperframes skills update   # refresh skills when missing/stale
```

## Key composition rules

1. Timed elements: `data-start`, `data-duration`, `data-track-index`
2. Timed elements **must** `class="clip"`
3. GSAP timelines paused + registered:
   ```js
   window.__timelines = window.__timelines || {};
   window.__timelines["composition-id"] = gsap.timeline({ paused: true });
   ```
4. Video: `muted` video + separate `<audio>` when needed
5. Sub-comps: `data-composition-src="compositions/file.html"`
6. Deterministic only - no `Date.now()`, `Math.random()`, network in render path

## After edits

Always `npm run check` before declaring done. Fix errors; review warnings.

## Stack pairing (Yuval / YUV.AI defaults)

- Prefer **HyperFrames + GSAP** for motion video
- React/Next when product UI - still export motion via HyperFrames workflows when the deliverable is video
- html-to-canvas / HyperFrames render pipeline over ad-hoc ffmpeg slideshows unless user asks otherwise
