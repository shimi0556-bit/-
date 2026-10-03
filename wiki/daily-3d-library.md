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
- **2026-10-03, round 2 on #002 (user compared it with photos of the real tank):** the first version had a tall boxy turret, flat sponson shelves, a bulbous gun and light green-khaki paint. Rebuilt: turret = loft between a bottom and a roof outline (`ST` stations, sides lean 35°, roof slopes), armour modules built on that slope (`modGeo`, chamfered), sloped sponsons, long chamfered front skirt with the company chevron, thermal sleeve over most of the barrel, darker paint.
  - The user also asked for it to hold up when zoomed in. Paint shader now has a cast-steel micro-bump, chips and roughness variation. Pitfalls: (1) screen-space `dFdx` bump looks like pixel blocks (quad-constant), so compute the gradient analytically from the noise in object space and carry the view-space axes in varyings (`normalMatrix` is not available in the fragment shader); (2) the old multiplicative hash showed visible patterns, use a Hoskins-style hash and quintic interpolation; (3) fade noise octaves out with `fwidth(vObj)` to avoid shimmer at distance.
  - Zoom limits: viewer `minDistance` is 0.15 and camera near 0.05, enough for bolt-level views.
  - Use `RB()` (slightly rounded box) for things that people touch or see up close; plain `BoxGeometry` for hidden or repeated parts.
- **2026-10-03, round 3 on #002 (second photo comparison):** the skirts were too long and hid the road wheels (on the real tank they end around the wheel axle height, so the lower half of every wheel and the track show). Skirts are now 0.84 m (hinge at y 1.46), the sponson is flatter (slope 0.14 over 0.81 m), the front fender is shorter, the bore evacuator is back as a slim bulge near the muzzle end of the sleeve, and the paint is a lighter khaki-olive. Lesson: compare the side silhouette first (skirt height vs wheel height), before working on small details.
- **2026-10-03, round 4 on #002:** turret roof raised ~8 cm for more bulk, cupola is a lathed cast body with a raised ring and bolts, machine guns rebuilt (receiver, feed cover, perforated gas jacket with ribs, flash hider, ammo box, brass feed chute, rear sight, grip, pintle post) with shields on both the commander and loader guns. Still open: the commander's and gunner's sights are plain boxes, and the turret interior is only partially modelled.
- **2026-10-03, round 5 on #002:** gunner sight and commander sight rebuilt (soft-body heads, lens barrels with bezels and coated glass, laser window, visor/hood, wiper wire, cable). Still open: the turret interior is only partly modelled and the RWS camera is still a box.
- **2026-10-03, round 6 on #002:** turret interior detail (ribs, liner, lamps, eyepieces, grips, drives, display, harnesses), RWS camera ball. Pitfall: inner roof ribs sized for the flat rear roof poked through the sloping front roof; check each rib against `roofY(x)`. Still open: interior of the hull driver compartment is basic; the wheel/skirt interplay when skirts are lifted could use hinge arms.
- **2026-10-03, round 7 (closing #002):** driver compartment fittings, jerrycans and stowage boxes with real details, rear fender lips. Removed the skirt hold-open struts: they stuck out above the skirts. The tank is considered complete: all QA shots reviewed (hero, sides, rear, top, under, explode, x-ray, cut, open, night, 5 custom views, interior cuts). Remaining honest gaps: no hull-side interior liners beyond the driver's area, no engine compartment firewall, and the 32-round ammo count (real ~48).
- **2026-10-03, round 8 on #002:** closed the three known gaps: firewall and engine partition, aramid hull liners with harnesses, and 48 rounds in the hull (was 32). Triangle count ~400K, still under budget. Note: a long QA + screenshot command can exceed the 120 s tool limit; run it in the background and wait on the output file.
- **2026-10-03, round 9 on #002 (real firing):** new `fire` toggle with pooled sprite effects (flash, smoke, dust), tracer, recoil group (`recoilG` holds the barrel parts) and a Web Audio boom. QA hook: `L3D.kit.__fire.at(seconds)` sets the effect state deterministically (shot mode has no frame loop). The point light is created at build time with intensity 0 so toggling it never recompiles materials.
