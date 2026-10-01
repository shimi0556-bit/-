# daily-3d-library (ספריית התלת־ממד היומית)

A library that grows by one procedurally-modelled object a day, starting with cars. Each model is built only in code (Three.js r170 from jsDelivr) down to fasteners and seals, and bundled into one self-contained HTML page with a Hebrew UI: parts and systems browser, exploded view, cutaway, x-ray, camera views and toggles for moving parts. Gallery: `daily-3d-library/index.html`.

## How it works

- `engine/kit.js`: modelling kit on `window.L3D.kit`: cached materials, primitives, `surface(S, xs, vs, {skip, out, offset, thickness})` for parametric body panels (patches cut from the same surface line up with their holes through shared `samples()` break points), canvas textures, `part()` registry, `instances()`, `toggle()` / `onFrame()`.
- `engine/viewer.js` + `viewer.css`: the shared viewer. Per-mesh system resolution (`userData.sysOverride` lets door glass and door armour live inside the door but belong to the glass and armour systems). Explode = system lift + radial spread + per-part `explodeLocal`. X-ray ghosts the `shell: true` systems. Cutaway is one clipping plane on all materials. `?shot=1` = no render loop and no UI; `window.__render()` is for the headless harness.
- `build.py` inlines kit + model + viewer + meta into `models/<id>/index.html`, and generates `index.html` (gallery) and `catalog.json` from every `meta.json` + `stats.json`.
- `tools/check.cjs` renders headless with Playwright, fails on page errors, and writes `thumb.jpg` + `stats.json`. `--qa` writes `shots/*.png` (git-ignored).
- `queue.json` is the build order. `BUILD_GUIDE.md` is the daily procedure + quality bar that the routine follows.

## Models

| # | Model | Parts / triangles |
|---|---|---|
| 001 | Cadillac One "The Beast" (2018) | 234 / ~530K |

## Notes

- **2026-10-01: library created, #001 The Beast.** Built the engine, gallery, build/check tooling and the first model.
  - Sandbox: the headless Chromium rejects the proxy's TLS certificate (`ERR_CERT_AUTHORITY_INVALID`). `check.cjs` therefore routes CDN requests through `curl` (which trusts the proxy CA) and serves them from a temp cache. Don't "fix" this by ignoring HTTPS errors.
  - SwiftShader renders slowly, so shot mode has no render loop. The harness calls `__render()` per shot. A continuous loop made screenshots time out.
  - `RoomEnvironment` made the black paint look white (the bright ceiling reflected in it). Replaced with a dark studio environment with soft-box strips.
  - Armour layers 6–12 mm behind the door skin z-fought through it as vertical streaks. Fixed by moving them to ≥ 20 mm and raising the camera near plane to 0.05. Rule: keep stacked shells ≥ 8 mm apart.
  - Rear headrests poked through the backlight. Fixed with a formal, upright backlight (`BL_TOP -1.38`, `BACK -1.69`) and seats moved forward, which also gives the Beast's thick C-pillar.
  - Open: on very distant views one faint streak can remain on the rear door in SwiftShader (16-bit depth). It doesn't show on a real GPU.
