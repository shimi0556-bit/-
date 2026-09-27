---
name: gilaf-sdf
description: >-
  Create high-quality 3D models by writing Gilaf SDF recipes (signed distance fields in a small
  JavaScript language), rendering them headlessly, critiquing the renders and refining until the
  model looks professional, then exporting GLB (games, Blender, Three.js) or STL (3D printing).
  Trigger whenever the user asks to create, sculpt, design, model or print a 3D model, character,
  prop, figurine, toy, chess piece, vase, logo in 3D or game asset, or mentions Gilaf, SDF,
  signed distance fields, GLB/STL export, "מודל תלת מימד", "מודל תלת־ממד", "פסל", "לפסל", "גילוף",
  "הדפסה בתלת מימד", "קובץ STL", "מודל למשחק" — even if they do not name the skill.
---

# Gilaf: sculpting 3D models with signed distance fields

The studio lives in `gilaf-sdf/` at the repo root. A model is a **recipe**: the body of a JavaScript
function that returns a shape built from primitives, smooth blends, cuts, repeats and paint.
Read `gilaf-sdf/docs/recipe-reference.md` before writing your first recipe in a session. It is the
complete language reference plus the craft rules. For the expected quality bar, read one or two of
`gilaf-sdf/recipes/*.js` (robot.js for hard-surface work, octopus.js for organic, rook.js / vase.js for turned objects).

## Workflow

1. **Plan** (in your head, briefly): reference size, primary masses, secondary forms, tertiary
   details, 2–4 colors plus an accent, which parts are symmetric (`mirror`) or repeated (`ring`, `grid`).
2. **Write** the recipe to `gilaf-sdf/my-models/<name>.js`. Use variables for proportions and
   1–3 `param()` sliders for the most interesting ones.
3. **Check** that it compiles:
   `node gilaf-sdf/tools/gilaf.mjs check gilaf-sdf/my-models/<name>.js`
4. **Look**: render a 2×2 contact sheet (three-quarter, front, side, back) and open it with Read:
   `node gilaf-sdf/tools/gilaf.mjs render gilaf-sdf/my-models/<name>.js --out gilaf-sdf/my-models/shots/<name>.png --size 800 --frames 2`
   Add `--clay` to judge pure form without color.
5. **Critique** against the checklist below, edit the recipe, render again. Do at least two
   refinement rounds; stop when the checklist passes (usually 2–5 rounds).
6. **Export** when the user wants files:
   - games / Blender / Three.js: `node gilaf-sdf/tools/gilaf.mjs export <recipe> --out gilaf-sdf/my-models/out/<name>.glb --res 256 --tris 100000`
   - 3D printing: `... export <recipe> --out gilaf-sdf/my-models/out/<name>.stl --res 320 --mm 80` (Z-up, standing on the plate, tallest side = `--mm`)
   - several at once: `--formats glb,stl,obj`
   The command prints triangles and signed volume. The volume must be positive; otherwise report it.
7. **Deliver**: a final render (`render --size 1400 --frames 6`, or `still --yaw 30 --pitch 15`),
   the recipe path, the exported files, and one line on how to tweak it: open `gilaf-sdf/dist/gilaf.html`
   (or the published studio) and paste the recipe into the editor to get live sliders.

## Critique checklist

- **Silhouette**: readable and interesting from front AND side; no accidental blobs.
- **Proportions**: consistent with the reference size; nothing accidentally huge or tiny.
- **One piece**: every part touches or overlaps something (floating parts break 3D prints).
- **Three levels of detail**: primary masses, secondary forms (rims, panels, lids, muscles),
  tertiary detail (seams via thin `cut`, bolts, subtle `displace`). The back must look finished too.
- **Blends**: organic joints use `add(part, k)` with k ≈ 10–30% of the smaller part; hard-surface
  joints use small k or `box(..., round)`.
- **Color**: intentional palette, markings with `paint`, natural surfaces with `colorNoise`,
  marble or cracks with `colorNoise(..., {veins: true})`, `glow` only for lights and eyes.
  Color operations apply in the order written; the must-show paint goes last.
- **Artifacts** (streaks, speckles, holes, box-shaped bulges): lower `displace` amount × scale,
  keep repeated parts from spanning more than one neighbouring copy, or add `scene({ step: 0.6 })`.

## Gotchas learned the hard way

- `lathe([[r, y], ...])` needs heights that increase; it is far smoother and faster than
  `polygon(...).revolve()`. Hollow vessels: `.shell(t).cut(halfspace('-y', top - 0.03))`.
- `cut(b)` paints the cut surface with b's color only if b (through its transforms) has its own `.color()`.
- `halfspace('y', h)` is everything BELOW y = h; `halfspace('-y', h)` is everything above.
- `extrude` works along Z. To lay a 2D outline flat (wings, plates) use `.extrude(t).rotateX(90)`.
- Rendering in this container is software WebGL: a sheet takes 5–60 s. Iterate at `--size 800 --frames 2`.
  Real GPUs are 50–100× faster, so heavy recipes that are slow here are fine for the user.
- The studio's in-app Claude tab uses the same reference (`docs/recipe-reference.md` is embedded at build time).
  After changing the language or the reference, rebuild with `node gilaf-sdf/tools/build.mjs`.

## Extending the language

Primitives and operations live in `gilaf-sdf/src/dsl.js` (API + bounds) and `gilaf-sdf/src/glsl.js`
(GLSL code generation). A new operation needs: the API method, a bounds rule (conservative box, or
`null`), and an emit case for both the distance pass and the color pass. Update the reference doc,
rebuild, and re-render all `recipes/` to check nothing regressed.
