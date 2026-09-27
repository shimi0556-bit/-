# hamigrash-trailer (ערוץ המגרש)

A 30-second vertical (1080×1920) Hebrew trailer for the repo's launcher page (`index.html`, see [`playground.md`](playground.md)). Built with the HyperFrames skills (`hyperframes` → `general-video`, plus `hyperframes-core`, `-creative`, `-animation`, `-cli` and `media-use`). The final render is `hamigrash-trailer/renders/hamigrash-trailer.mp4`.

## Concept

It was picked from five pitches: the repo presented like a **sports channel's evening lineup**. The design comes from the launcher's court look: court blue, painted-line white, an optic-yellow accent, and Karantina + IBM Plex Sans Hebrew + IBM Plex Mono.

| Time | Scene | Motion source |
|---|---|---|
| 0–3.75s | Cold open: court lines draw, the live bug pops, "אנחנו על המגרש" | blueprint `logo-assemble-lockup`, rule `svg-path-draw` |
| 3.75–9.35s | Main event: Shimotron Rally in a broadcast monitor, plus a stat strip | blueprint `device-surface-showcase` |
| 9.35–15.15s | Tonight's board: chess, reversi, go and generals cycle inside a pinned frame | blueprint `fixed-anchor-cycle` |
| 15.15–20.75s | Replays: bowling, snake, ABYSS and SkyHawk full-bleed, with flash cuts | rules `multi-phase-camera`, `discrete-text-sequence` |
| 20.75–25.95s | League table of the 7 courses, then 4 tool chips | blueprint `grid-card-assemble` |
| 25.95–30s | Final score 9 · 7 · 4 counts up, then "המגרש של שימי" | `dataviz-countup` + `titlecard-reveal`, rule `counting-dynamic-scale` |

The broadcast chrome stays on screen the whole time: channel bug, a clock driven by timeline time, and a left-to-right news ticker. Transitions are staggered colour blocks, with one vertical push into the replays.

## Files

- `build/index.template` is the source to edit. `python3 build/assemble.py` inlines the local `@font-face` rules and writes `index.html`, which is the composition HyperFrames reads.
- `assets/fonts/`: Karantina and IBM Plex Sans Hebrew woff2 files (Hebrew and Latin subsets). `assets/vendor/gsap.min.js`: GSAP 3.14.2 from npm.
- `assets/shots/`: screenshots of the games. `*-v.jpg` are portrait-native captures (540×960 @2x) used full-bleed in the replay scene.
- `.media/`: four SFX resolved from media-use's bundled offline library (whoosh, bass impact, riser, chime), with their manifest.
- `BRIEF.md` / `STORYBOARD.md`: the confirmed brief and the per-scene plan.

## Commands

```bash
cd hamigrash-trailer
python3 build/assemble.py                  # after editing build/index.template
npx hyperframes@0.8.80 check               # lint + runtime + layout + contrast
npx hyperframes@0.8.80 render --fps 30 -o renders/hamigrash-trailer.mp4
```

Rendering needs FFmpeg and HyperFrames' headless Chrome (`npx hyperframes browser ensure`).

## Notes

- **2026-09-27, first version.** `check` passes: 0 errors, and 84/84 texts pass WCAG AA. The only lint warning left is `composition_file_too_large`, because the build is one monolithic file following the catalog scene template (six scenes, one timeline).
- **`<html dir="rtl">` renders a black video.** Lint catches it (`html_dir_attribute_breaks_render`). Direction is set on `#root` in CSS instead. Keep it that way.
- The ticker's "מבזק" label sits in a tab above the crawl, not on top of it. Covering the crawl tripped `text_occluded` and a 1:1 contrast finding on clipped text.
- The decorative ghost words carry `aria-hidden="true"` and `data-layout-ignore`, so the contrast audit skips them.
- No music bed. HeyGen was signed out and no local music engine was installed, so there are sound effects only. To add music: `npx hyperframes auth login`, then `media-use resolve --type bgm`.
- `renders/hamigrash-trailer.html` is a single self-contained HTML page with the trailer embedded (base64). It uses a CRF-20 re-encode of the MP4, which is 6.8MB with SSIM 0.9975 against the original, so the page is 9.2MB. The page starts with `<!DOCTYPE html>` plus a `Content-Type: text/html` meta so download tools classify it as HTML. `.gitattributes` keeps git from diffing it as text.
- In this sandbox, `jsdelivr` and `cdnjs` are blocked. That's why GSAP is vendored locally, and why the ABYSS/SkyHawk screenshots were taken with a local three r128.
