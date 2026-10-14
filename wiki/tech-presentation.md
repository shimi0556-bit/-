# tech-presentation (כשהטכנולוגיה מתחילה לעבוד בשבילנו)

A 13-slide Hebrew (RTL) deck about humanoid robots, built around the user's own copy of Boston Dynamics' **Atlas Gets a Grip** (Jan 2023, 426×240, 80.8s, no audio). The whole deck is one self-contained file, `tech-presentation/index.html` (~3.2 MB): the video is embedded as base64 and Edit Mode is injected (repo rule: every HTML deck gets `deck-edit-mode`).

## Slides

1 title · 2 agenda · 3 tech everywhere · 4 timeline (gear → computer → phone → AI chip → Atlas) · 5 robot anatomy with 5 numbered callouts · 6 the story + what to watch · **7 the video** with 8 clickable chapters · 8 film strip (8 stills; clicking one jumps into the video at that second) · 9 what is hard · 10 where it could help · 11 two sides (balance cartoon) · 12 what next · 13 thanks + sources.

## Files

- `src/deck.src.html` is the source to edit; `tools/build.py` inlines SVGs, JPEG stills, the halftone texture and the video, then runs the `deck-edit-mode` injector. Never edit `index.html` by hand (rebuilding overwrites it).
- `tools/art.py` draws every cartoon as SVG (robot, worker, scaffold, city, balance, timeline icons) into `assets/art/`. Anatomy leader lines and the label rows in `build.py` (`MARKS`, `ANAT_*`) must stay in sync with `art_anatomy()`.
- `assets/video/atlas-gets-a-grip.mp4` is the user's upload with the attached cover-art stream stripped (`-map 0:v:0 -c copy`, faststart).
- `assets/frames/ch_01..08.jpg` are stills at 0:04, 0:12, 0:20, 0:30, 0:36, 0:43, 0:46, 0:56 (the same seconds as the chapter list), already tone-corrected. `halftone-cyan.jpg` is the comic-dot texture on slides 1 and 13.
- `tools/shot.mjs` / `tools/render-slides.mjs`: Playwright screenshots for QA (art contact sheet / every slide).

## Notes

- **Canva was out of credits** (`quota_exceeded` on all 7 `generate-image` calls; not retried). The user's preference is Canva + Photoshop + GitHub, so the cartoons were drawn as code instead. If credits come back, Canva images can replace the SVGs in `assets/art/` with the same slots.
- **Photoshop (Adobe connector) was used for the stills**: the 8 frames were tiled into one 1704×480 grid, uploaded, `image_apply_auto_tone` ran once on the grid, and the result was sliced back (cheaper than 8 uploads). The comic texture is a 1280×720 upscale of the 0:56 frame → `image_apply_halftone` (radius 9, B&W) → `image_apply_monochromatic_tint` (hue 192). Halftone at radius 9 is too coarse to read as a picture, hence it is only a faint texture. Adobe's upload flow works from this sandbox (presigned PUT via curl). Adobe has no generative image tools in this environment.
- **Gotcha:** never put `.float` (infinite animation) on the same element as `.anim` — the later `animation` shorthand wins and the entrance animation loops, leaving the art half-transparent. `.float` lives on an inner wrapper.
- The video lives in a `<script type="text/plain">` and is turned into a blob URL at runtime, so Edit Mode's per-slide localStorage autosave never stores megabytes. `show()` re-applies the blob URL, which also heals a slide restored from autosave.
- Headless Chromium in this sandbox has **no H.264**, so the real MP4 cannot play there. Chapter/seek/pause logic was verified with a throw-away WebM copy of the same footage; real browsers play the MP4 fine. The footage is only 426×240, so it is soft when enlarged; that is the source, not a bug.
- Chapter facts come from the footage plus Robotics 24/7, The Robot Report and Euronews (worker forgot the tool bag; plank used as a bridge; bag tossed with a spinning jump; box pushed off; inverted 540 flip; Atlas is a research platform, not for sale). The footage itself ends at 64.9s, then a Boston Dynamics end card. "Hydraulic Atlas" on slide 5 is from general knowledge, not from those sources.
