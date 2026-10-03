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
| 001 | Cadillac One "The Beast" (2018) | 246 / ~610K |

## Notes

- **2026-10-01: library created, #001 The Beast.** Built the engine, gallery, build/check tooling and the first model.
  - Sandbox: the headless Chromium rejects the proxy's TLS certificate (`ERR_CERT_AUTHORITY_INVALID`). `check.cjs` therefore routes CDN requests through `curl` (which trusts the proxy CA) and serves them from a temp cache. Don't "fix" this by ignoring HTTPS errors.
  - SwiftShader renders slowly, so shot mode has no render loop. The harness calls `__render()` per shot. A continuous loop made screenshots time out.
  - `RoomEnvironment` made the black paint look white (the bright ceiling reflected in it). Replaced with a dark studio environment with soft-box strips.
  - Armour layers 6–12 mm behind the door skin z-fought through it as vertical streaks. Fixed by moving them to ≥ 20 mm and raising the camera near plane to 0.05. Rule: keep stacked shells ≥ 8 mm apart.
  - Rear headrests poked through the backlight. Fixed with a formal, upright backlight (`BL_TOP -1.38`, `BACK -1.69`) and seats moved forward, which also gives the Beast's thick C-pillar.
  - Open: on very distant views one faint streak can remain on the rear door in SwiftShader (16-bit depth). It doesn't show on a real GPU.
- **2026-10-01, round 2 (user feedback on #001):** the user found the steering wheel inside the driver's seat, too many plain geometric shapes (the seats especially), missing buttons, and the wheel crest looking like it floated.
  - Fixed by rebuilding the interior: shallower dash (rear face x 0.755), wheel at (0.60, 1.20), seats and partition (x -0.21) moved so nothing intersects.
  - Added kit tools: `G.soft` (sculpted rounded box with a deform function and smooth normals across face seams), `M.quilted` (pleats, double stitching and perforations as colour + bump canvas maps), `K.panel` (real 3D buttons, knobs, rockers and guarded toggles with one backlit label texture per panel).
  - Gave the wheel hub a solid pilot through the centre bore and a flat-topped cap with the crest in a bezel.
  - Found that the dash's extrude bevel had grown its outline 2 cm and buried the screens; fixed with `bevelOffset`.
  - These lessons are now in BUILD_GUIDE.md under the pitfalls.
- **2026-10-01, round 3:** the user asked for the **Merkava Mk 4M tank** as the next daily model. It's at position 2 in `queue.json`, with a `note` listing the features that must be right: front engine, rear door, Trophy, tracks with 6 road wheels, turret chains, and others. BUILD_GUIDE now says to treat a queue `note` as part of the brief and to load the `boneh-dgamim-3d` skill first. Its tank checklist covers track links, sprockets and idlers, turret, gun and hatches, plus the toggles to build (turret traverse, gun elevation, running tracks).
- **2026-10-03: #002 Merkava Mk 4M** (231 parts, ~280K triangles). The first non-car model, built from the queue `note`.
  - Layout that works: hull = side profile extruded per side + sloped plates between profile points; turret = plan-view polygon extruded upward (`planPrism`), with the front roof slope made by bending the extrusion's top vertices; one turret group at the ring centre carries gun, optics and Trophy parts (they use `sysOverride`), so turret traverse and gun elevation need no extra sync.
  - Tracks: one closed path (arcs + tangent lines, arc-length sampled) drives every link as an instance, plus wheel, sprocket and roller rotation (`K.onFrame`). Shot mode has no frame loop, so the QA harness only sees the initial pose. To test motion, call `K.registry.frames` by hand and then `__render()`.
  - Pitfall: my `plateBetween` offset the plates the wrong way (plates were 7 cm too high on the deck and louvers/decal were buried). With a CCW profile, `n = (-dy, dx)` points inward, so inset = `+n`.
  - Pitfall: per-pixel `floor()` hash noise in the dust shader read as a pixel-art camouflage. Use smooth value noise (3D, smoothstep) instead.
  - Pitfall: open cylinders (`G.cyl(..., open=true)`) need a DoubleSide material, otherwise the basket wall vanishes in the cutaway.
  - Pitfall: the QA cut plane removes the +z side, so interior shots must be taken from +z.
  - Improvements chosen from `next-level.md`: (1) wear & dust paint (`dusty()` in model.js, worth moving into `engine/kit.js` if another model wants it), (2) living mechanisms (tracks, fan, RWS sweep, Trophy launchers).
  - `tools/check.cjs` now reads optional `meta.qa.open` / `meta.qa.night` toggle lists for the 'open' and 'night' QA shots, defaulting to the car toggles.
  - Open: the exploded view lifts turret-mounted gun/optics/Trophy with the turret (only direct children of a system explode). Ammo is 32 + 4 rounds (real ~48). The chain curtain is short on purpose, so the open rear door clears it.
