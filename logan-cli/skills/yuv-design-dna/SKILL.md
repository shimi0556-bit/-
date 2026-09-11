---
name: yuv-design-dna
description: >
  Yuval's design DNA - MANDATORY for any web/frontend deliverable: landing page,
  website, app UI, dashboard, React, HTML, CSS, portfolio, promo page. Signature
  moves (video-scrub heroes, parallax frame-scrub, HyperFrames motion), the YUV
  design system (palettes, Anton/Inter + Rubik/Assistant, radii 0/999), hard
  accessibility + mobile-first gates, and the anti-AI-look checklist.
  Trigger: landing page, website, frontend, UI, dashboard, React, HTML, CSS,
  design, page, app. Hebrew: אתר, דף נחיתה, עיצוב, דאשבורד, אפליקציה.
---

# YUV design DNA

Every web deliverable ships with **Yuval's signature, not a template**. This
skill is the umbrella: it decides the look, the motion language, and the
quality bar. Sibling skills carry the deep technique - route to them, do not
reinvent.

## Signature moves - reach for these FIRST

When a landing/promo/showcase page is requested, default to one of Yuval's
signature hero techniques instead of a static hero. If a short video exists or
can be produced, a scrub hero is the default, not an upgrade.

| Move | When | Deep skill |
| --- | --- | --- |
| **Mouse-driven video scrub** - fixed full-page video backdrop, cursor position scrubs the timeline, 4-5 opaque narrative sections | Premium/cinematic landing, brand storytelling, a hero clip exists | `cinematic-scrub-landing` |
| **Scroll-driven frame scrub** - page scroll (or virtual scroll) steps through extracted frames, dramatic text overlays crossfade | Apple-style product story, single-hero page, 5-15s clip | `parallax-landing-page`, `video-to-landing-page` |
| **HyperFrames composition** - HTML → deterministic MP4 for any motion/video deliverable | Promos, explainers, captions, launch videos, motion inside pages | `hyperframes-master` |
| **GSAP scroll choreography** - staggered reveals, pinned sections, counter-ups, split-text | Every page, even without video | inline (rules below) |

**HyperFrames catalog first.** Before hand-rolling any motion pattern, list
what already exists and compose from it:

```bash
npx hyperframes catalog            # blocks + components registry
npx hyperframes docs effects       # effects reference
npx hyperframes docs transitions   # scene transitions
npx hyperframes add <block>        # install a block, then wire it
```

Pick 2-3 catalog blocks/effects per project and customize; hand-roll only what
the catalog genuinely lacks. Same discipline for text effects and transitions -
the registry's are seek-safe and render-deterministic, yours might not be.

## Design system (distilled from yuv-design-system)

Two palette modes. Default **Fly High**; **Warm Editorial** only for the
Hope/bigcats/practical family or when a warm paper-feel is requested. A
project's own brand spec always wins over both.

```css
/* Fly High (default) */
--yuv-purple: #5E17EB; --yuv-purple-dark: #3D0DA8; --yuv-yellow: #FFEC00;
--yuv-grey: #F1F2F2; --yuv-white: #FFFFFF; --yuv-black: #000000;

/* Warm Editorial */
--pink: #FF1464; --yellow: #E5FF00; --black: #0A0A0A;
--off-white: #FAFAF7; --bone: #F5EEE4; --charcoal: #1A1A1A;
```

Non-negotiables (both modes):

- **Two-background rule** (Fly High): sections are either purple-with-white
  headlines (act) or light-grey-with-black headlines (content). Yellow is an
  accent, **never** a background. Never invent a third state.
- **No pure `#FFFFFF` page root.** Cards on grey may be white; the canvas never.
- **Radius `0` or `999px` only.** The 8-12px middle ground is the #1 AI tell.
- **No blue/slate/indigo/emerald/cyan/zinc.** No default Tailwind palette.
- **Asymmetric over grid-perfect.** One element breaking the grid is the move.
- Max content width 1440px. Section padding 120-160px desktop, 64-80px mobile.

Typography (mandatory):

- **EN display:** Anton, ALWAYS UPPERCASE, letter-spacing `0` (it is already
  condensed - negative tracking is the old mistake), line-height 1.0-1.05.
- **EN body:** Inter. **Mono readouts:** JetBrains Mono.
- **HE display:** Rubik. **HE body:** Assistant. `lang="he" dir="rtl"` +
  logical properties (`margin-inline-start`). Never stack EN+HE display side
  by side - use a language toggle.
- Banned: Poppins, Plus Jakarta Sans, serif/script defaults, system-ui stacks.

## Anti-AI-look checklist - run before presenting

The output must feel like a human art-directed it. Reject your own draft if
any of these tells are present:

1. Purple-gradient-on-white SaaS template, or any hero = "centered headline +
   two buttons + screenshot in a tilted frame".
2. 8-12px border radii, drop shadows with blue-black tint, emoji as section
   bullets, "✨ Unlock the power of ..." copywriting voice.
3. Three perfectly symmetric feature cards, repeated. Break at least one row:
   offset columns, oversized numerals, an element crossing a section boundary.
4. Every section animated the same way (fade-up). Vary rhythm: one pinned
   scene, one hard cut, one slow crossfade. Motion should have *pacing*.
5. No texture at all. Add one human layer: paper grain, a Caveat/hand accent,
   a scribbled underline, a photographic background with real grading.
6. Placeholder voice. Write copy in the project's actual voice with concrete
   nouns and numbers ("4 models, 1 pipe, 60fps" beats "Powerful & flexible").

## Accessibility gates (WCAG AA) - blocking, not optional

- Semantic landmarks (`header/main/section/footer`), one `h1`, logical order.
- Contrast AA: white-on-purple `#5E17EB` passes; black-on-grey passes;
  yellow only as accent on dark or with black text. Verify anything else.
- **Every scrub/parallax/GSAP effect ships a `prefers-reduced-motion`
  fallback**: static hero frame + simple fades, page still fully readable.
  Scroll-jacking (virtual scroll) must keep keyboard paging working
  (space/PageDown advance the narrative) and never trap focus.
- `:focus-visible` styles on all interactive elements; skip-to-content link
  on pages with fixed heroes; alt text that describes, not decorates.
- Touch targets >= 44px; form inputs with real labels.

## Mobile-first gates - blocking, not optional

- Design at 390px FIRST, then scale up. Breakpoints: 640 / 1024 / 1440.
- Zero horizontal scroll at any width; wide content scrolls inside its own
  `overflow-x:auto` container.
- Scrub heroes on touch: mouse-scrub degrades to touch-drag or slow auto-play;
  scroll-scrub keeps working natively but halve the frame count on mobile.
- Type scales down: Anton hero >= 40px at 390px, body >= 16px, line-length
  <= 70ch. Test the Hebrew variant too if the page is bilingual.

## Performance defaults

- Scrub frames: preload frame 0 inline (instant LCP), lazy-decode the rest in
  order, JPEG quality ~80, cap ~120 frames desktop / ~60 mobile.
- `font-display: swap`, preconnect to fonts, one combined Google Fonts link.
- GSAP: transforms/opacity only (no layout thrash), `will-change` on the few
  animated layers, kill ScrollTriggers on unmount.

## Definition of done - verify, then present

Before showing the result, actually check (headless browser or manual):
390px + 1440px render, keyboard-only pass, reduced-motion pass, contrast
spot-check, palette + typography compliance, anti-AI checklist, and - if a
scrub hero - first paint shows frame 0 instantly. Fix before presenting;
"stunning but inaccessible" is a failed deliverable.
