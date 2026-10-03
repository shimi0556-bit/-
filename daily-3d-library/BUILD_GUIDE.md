# Build guide: one model a day

This is the procedure and quality bar for adding a model to the library. The daily routine follows it from top to bottom. `models/001-cadillac-one-the-beast/` is the reference implementation: read its `model.js` before writing a new one.

## 1. Pick the object

- Take the first item in `queue.json` whose `slug` has no folder in `models/` yet. If the item has a `note`, it holds the user's wishes and the features that must be right for that object, so treat it as part of the brief.
- Load the `boneh-dgamim-3d` skill first (`.claude/skills/boneh-dgamim-3d/SKILL.md`). It holds the method, the per-type anatomy checklists (car, tank, aircraft, ship, building, machine) and the QA routine this guide relies on.
- Folder: `models/<NNN>-<slug>/`, where NNN is the highest existing number + 1 (3 digits).
- Date = today in Israel time (`TZ=Asia/Jerusalem date +%F`), plus a Hebrew date string for `dateHe` (e.g. `2 באוקטובר 2026`).

## 2. Research (15–20 minutes, not more)

Collect the real numbers before modelling: overall length / width / height, wheelbase and track, tyre size, engine layout, seating, notable mechanisms, colours, badges, lettering. Search the web, prefer manufacturer data and Wikipedia, and record every source in `meta.json → sources`. When something is unknown or classified, make a sensible engineering estimate and say so in `specNote`.

## 3. Write the files

### `meta.json`

Copy the shape of `models/001-…/meta.json`:

- `id`, `number`, `date`, `dateHe`, `category` (Hebrew), `title`, `titleEn`, `subtitle`, `description` (Hebrew), `accent` (UI accent colour that fits the object).
- `systems`: 8–12 systems, each with `id`, Hebrew `he` + `desc`, a distinct `color`, `shell: true` for outer skins (ghosted in x-ray), and `explode` (`[x,y,z]` lift) + `spread` (radial multiplier) for the exploded view. Typical car systems: body, doors, glass, lights, insignia, wheels, brakes/suspension, chassis/drivetrain, engine, interior (+ anything special, like the Beast's armour and security).
- `views`: 3–5 custom camera views (`pos`, `target`, optional `fov` for interior shots, optional `toggles` to open things first, e.g. `["hood"]`).
- `specs` (Hebrew label/value pairs), `facts` (6–12 Hebrew one-liners; mark reported or uncertain claims as such), `sources`.

### `model.js`

```js
window.L3D_MODEL = {
  async build({ K, THREE, sys }) {
    const { M, G, V3, mesh, part, surface, samples, instances } = K;
    const body = sys('body');                                  // a system group from meta.json
    const hood = part(body, { he: 'מכסה מנוע', en: 'Hood', mat: 'פלדה', desc: '…' });
    mesh(G.box(1, 0.02, 1.6, 0.01), M.paint(0x07080b), { parent: hood, pos: [1.8, 1.2, 0] });
  },
};
```

Kit cheat-sheet (`engine/kit.js`):

| Need | Use |
|---|---|
| Named, documented part (hover/list/isolate/explode) | `part(parent, { he, en, mat, desc }, { pos, rot })`. Nest parts for sub-assemblies |
| Material | `M.paint(c)`, `M.chrome()`, `M.aluminum()`, `M.castIron()`, `M.rubber()`, `M.tire()`, `M.leather(c)`, `M.fabric(c)`, `M.carpet(c)`, `M.wood()`, `M.glass(c, opacity)`, `M.lens(c)`, `M.decal(tex)`, `M.screen(tex)` … (cached and shared) |
| Organic shapes (upholstery, pillows, housings, knobs) | `G.soft(w,h,d,{ r, seg, deform(p, n) })`: a subdivided rounded box you sculpt in normalised coordinates. Keeps 6 face groups, so `[mat×6]` arrays can put `M.quilted(color, 'u'|'v')` on the seating face only |
| Buttons, switches, knobs | `K.panel(parent, { pos, normal, up, w, h, buttons: [{ x, y, w, h, kind: 'rect'|'round'|'knob'|'toggle'|'rocker', label, led }] })`: real 3D controls + backlit labels in one texture |
| Primitives | `G.box(w,h,d,radius)`, `G.cyl(r1,r2,h,seg,axis)`, `G.lathe([[r,y]…],seg,axis)`, `G.tube(points,r)`, `G.torus`, `G.extrude(shape,depth,{bevel})`, `G.shape`, `G.roundRect`, `G.bolt(size)`, `G.hexNut`, `G.rivet`, `G.merge([...])`, `G.at(geo,pos,rot)` |
| Body panels | write a section function `S(x, v) → Vector3`, then `surface(S, xs, vs, { skip, out, offset, thickness })`. Cut doors/hood/glass as patches of the same surface; share break points via `samples(a, b, step, breaks)` so holes and patches line up |
| Many identical small parts | `instances(geo, mat, [{ pos, rot, scale }…])` (one draw call) |
| Text / decals | `K.textTexture(text, opts)`, `K.canvasTexture(w, h, draw)` |
| Moving parts | `K.toggle(id, { he, key, seconds, night }, (t) => …, initial)` adds a toolbar button + shortcut. `night: true` turns on in night mode |
| Animation | `K.onFrame((time, dt) => …)` |
| Explode a sub-part locally | `obj.userData.explodeLocal = V3(…)` |
| A part that lives inside another system's assembly | `obj.userData.sysOverride = 'armor'` (e.g. door armour rides with the door) |

### `README.md` (in the model folder)

What was modelled per system, the numbers used, sources, and open issues or known simplifications.

## 4. Quality bar: "down to the smallest detail"

- **Real dimensions** in metres. Axes: +x forward, +y up, +z to the right (passenger side).
- **At least 150 named parts** in the parts list, every system populated, every part with a Hebrew name and a one- or two-sentence Hebrew description (what it is, what it's made of, one interesting fact).
- **Go down the scales:** body → panels → fasteners. Expect bolts, nuts, rivets, washers, clips, seals and gaskets, hoses and wiring, valve stems, stitching, lettering on tyres/engines/plates, lamp internals (LED cells, reflectors, lenses), interior switches and screens. Inside parts too, visible in the cutaway (pistons, armour layers, run-flat inserts …).
- **Moving parts as toggles:** doors, hood, trunk, lights, plus anything special to the object.
- **Budget:** ≤ 700K triangles, ≤ 1,500 meshes, build < 1.5 s. Rounded boxes cost ~600 triangles each, so use `THREE.BoxGeometry` or `instances` for anything repeated dozens of times. Keep lathes/tubes at sensible segment counts.

## 5. Pitfalls already hit (don't repeat them)

- **Text on mirrored parts reads backwards.** Build left/right copies with a side parameter `s = ±1`, or rotate 180°. Never use a negative scale for anything carrying text or decals.
- **Layers closer than ~8 mm z-fight** (armour inside a door skin showed through as streaks). Keep stacked shells ≥ 8 mm apart.
- **Emissive lights need their own material** (not the cached `M.*` ones), otherwise one toggle lights up everything sharing it.
- **Check clearance against the hood and roof.** The first fan and the rear headrests poked through the body. Look at the side, top and cutaway shots.
- **Dark paint needs the studio environment** (already in the viewer). Don't switch back to `RoomEnvironment`, which makes black paint look white.
- **Pass a material array `[paint, M.black()]`** to solidified panels so their edges read as dark shut lines.
- **No plain boxes for anything people sit on or touch.** The user rejected box seats as "geometric shapes". Use `G.soft` + `M.quilted` for upholstery, and `G.soft` for armrests, consoles, mirror housings and pillows.
- **Controls need real buttons.** A cockpit without labelled buttons reads as unfinished. Use `K.panel` for the dashboard, wheel spokes, door armrests, seat sides, overhead and rear consoles.
- **Check clearances between parts that face each other.** The steering wheel once sat inside the driver's cushion. Leave space for a person: lower wheel rim ≥ 4 cm above and ahead of the cushion front, seat backs clear of the partition.
- **Nothing may float.** The wheel crest was a flat disc over a domed cap, so it looked like it hung in the air. Seat decals on flat faces or in a bezel, and close lathe profiles down to r = 0.
- **`G.extrude` with a bevel grows the outline by the bevel size.** Pass `bevelOffset: -bevel` when other parts are positioned against that outline (the dash buried its own screens by 2 cm).

## 6. Verify

```bash
python3 build.py --check                   # must print "ok" for the new model (no console errors)
node tools/check.cjs --qa <NNN-slug>       # writes models/<id>/shots/*.png: front, side, rear, top, under, explode, xray, cut, open, night + custom views
```

Look at every QA shot (Read the PNGs). Fix anything floating, intersecting, upside-down or mirrored, then re-run.

### 6b. Photo comparison, part by part (required for every model)

The user asked for this explicitly: every model is compared against real photos found on the internet, part by part, before it is published. Our own render can look fine on its own and still be wrong (the Merkava's skirts hid the wheels and the Tesla's nose was a box until we compared).

```bash
python3 tools/refs.py fetch "<object name + generation>" $SCRATCH/ref <optional title filter>   # Wikimedia Commons, free licences
python3 tools/refs.py sheet $SCRATCH/ref_sheet.jpg $SCRATCH/ref/*.jpg                           # read the sheet, pick 4-6 angles
node tools/shot.cjs <id> $SCRATCH/m m01 '{"pos":[…],"target":[…],"fov":30}' …                  # match each photo's camera
python3 tools/refs.py pair $SCRATCH/ref/01.jpg $SCRATCH/m/m01.png $SCRATCH/cmp_01.jpg          # REAL | MODEL side by side
```

1. Pick photos in the same colour/variant as the model, covering at least: front, front 3/4, side, rear 3/4, rear, and one close-up of each signature part (wheel, lights, cockpit, hatch…).
2. Match each angle with `tools/shot.cjs` and compare the pairs. Go **part by part**, in this order: silhouette and proportions (roofline, overhangs, ride height, wheel size vs body), big masses (nose, tail, turret…), then each system (lights, wheels, glass, trim, markings), then colour and materials.
3. Write down every difference, fix the biggest first, re-shoot the same pairs, repeat until no part reads as wrong.
4. **Overlay, not just side-by-side.** For the main side/3-4 photo, solve the photo's camera from known points (`tools/camsolve.py`: wheel rims, tyre contacts, roof peak), render the model with that camera (`"bare": true`, same pixel size) and draw its edges over the photo (`tools/overlay.py`). Every gap in the red outline is a measurable error; back-project photo pixels onto a plane (z of that feature) to read real coordinates in metres and put them into the model as tables of measured points, instead of guessing curve parameters.
5. Never commit the photos (licences). List the Commons files you compared against in the model README under "Reference photos", and record what changed in the wiki notes.
 In the Claude Code sandbox Playwright is the global install. `check.cjs` fetches three.js with `curl` and serves it to the page, so it works behind the sandbox proxy.

## 7. Publish

1. `python3 build.py --check` once more, so `index.html`, `catalog.json`, `thumb.jpg` and `stats.json` are fresh.
2. Add the model's row to the table in `README.md`, and a dated line under `## Notes` in `wiki/daily-3d-library.md` (what was built, anything surprising, open issues).
3. Commit (`Add #NNN <name> to the daily 3D library`), push, and get it onto `main` as the routine instructs.
4. Send the model's `index.html` to the user (`SendUserFile`), with a two-line Hebrew summary: what it is and how many parts it has. Mention which reference photos it was compared against and what still differs.
