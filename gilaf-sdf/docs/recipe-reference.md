# Gilaf recipe language — reference

A recipe is the **body of a JavaScript function** that ends with `return <shape>`.
Every shape is a signed distance field (SDF); shapes are combined, blended, carved and painted.
Y is up. One unit ≈ whatever you like; models usually span 1–3 units. The model sits on a floor at its lowest point.

```js
const head = sphere(0.5).color('#f2c9a0', 'satin');
const nose = ellipsoid(0.09, 0.07, 0.12).move(0, -0.02, 0.48);
return head.add(nose, 0.06);          // smooth blend, radius 0.06
```

## 3D primitives (all centered at the origin)
| call | notes |
|---|---|
| `sphere(r)` | |
| `box(w, h, d, round=0)` | full width/height/depth; `round` bevels the edges |
| `ellipsoid(rx, ry, rz)` | radii |
| `capsule([x,y,z], [x,y,z], r1, r2=r1)` | a limb between two points; different radii make a tapered cone with round ends |
| `cylinder(r, h, round=0)` | vertical (Y) axis, full height `h` |
| `cone(rBottom, rTop, h)` | capped cone, vertical, full height `h` |
| `torus(R, r)` | ring in the XZ plane (lying flat) |
| `octahedron(s)` | gem/diamond shape |
| `halfspace(axis='y', offset=0)` | everything below `axis=offset` (`'-y'` = above). Use with `.cut()` / `.intersect()` |
| `tube(points, {radius, smooth=6, closed})` | smooth spline through `[x,y,z,r]` points (radius per point). Tails, tentacles, horns, pipes, handles |
| `lathe([[r,y], ...], {smooth=true})` | turned solid around Y from an outline of `[radius, height]` points, heights increasing. Perfectly smooth and fast: vases, bottles, chess pieces, columns, stems |

## 2D shapes → 3D
2D shapes live in the XY plane: `circle(r)`, `rect(w, h, round=0)`, `polygon([[x,y],...], {smooth})`,
`ngon(sides, r)`, `star(points, rOuter, rInner)`. They support `move(x,y)`, `rotate(deg)`, `scale(s)`,
`round(r)`, `shell(t)`, `add/cut/intersect`.
- `.extrude(depth, round=0)` → 3D along Z (logos, badges, cookie cutters).
- `.revolve(offset=0)` → spin around the Y axis. X of the 2D shape = radius, Y = height.
  Use it for profiles that fold back on themselves or rings (`circle(0.1).move(0.5, 0).revolve()` = torus).
  For ordinary turned objects prefer `lathe()`: it is smoother and much faster than a polygon profile.
  `polygon(points, {smooth: 4})` rounds a rough outline into a spline (more points = slower).

## Transforms (applied in the order written, in world space)
`.move(x,y,z)` (alias `.at`), `.rotate(xDeg, yDeg, zDeg)`, `.rotateX/Y/Z(deg)`,
`.orient([dx,dy,dz])` (point the shape's +Y axis along a direction),
`.scale(s)` or `.scale(sx,sy,sz)` (non-uniform is approximate but fine).
`.mirror('x')` — symmetric copy across the YZ plane: model ONE side at +x, mirror it (also `'z'`, `'xz'`).
`.ring(n)` — n copies around the Y axis. Place ONE copy off-axis wherever you like; the others are spaced evenly from it.
`.grid([sx,sy,sz], [nx,ny,nz])` — array of copies, centered.
`.twist(k)` twists around Y (radians per unit). `.bend(k)` bends along X.
`.elongate(x,y,z)` stretches the middle of a shape without distorting its round ends.

## Combining
`a.add(b, k=0)` union; `k > 0` melts them together with a fillet of radius ≈ k.
`a.cut(b, k=0)` subtract b from a (k = rounded edge). If `b` has its own `.color()`, the cut surface is painted with it.
`a.intersect(b, k=0)` keep the overlap.
`union(a, b, c...)`, `blend(k, a, b, c...)`, `group(...)` for many parts at once.

## Surface
`.round(r)` inflate (rounder, bigger). `.shell(t)` hollow skin of thickness t (cut it open to see inside).
`.displace(amount, scale=4, {octaves=4, ridged=false, seed})` organic noise: rock, bark, skin, terrain.
Keep `amount * scale` below ~0.6 for clean results.

## Color & material
`.color('#rrggbb', material?)` sets color for the whole sub-shape. Materials:
`'matte' 'clay' 'satin' 'plastic' 'glossy' 'metal' 'brushed' 'chrome' 'glow'` or `{rough, metal, glow}`.
`.material('metal')` changes only the material.
`.paint(region, '#hex', soft=0, material?)` paints where the surface is inside `region` (geometry unchanged):
spots, stripes, masks, belly color, eye whites. `soft` blurs the paint edge.
`.colorNoise('#hex', scale=6, amount=1, {sharp=0.5, seed})` mottled second color (skin, stone, rust).
`.colorNoise('#hex', scale, amount, {veins: true, sharp})` draws thin vein lines instead (marble, cracks, leaf veins).
`.gradient('#hex', 'y', from, to)` blends toward a second color along an axis.
Colors blend smoothly inside `add(..., k)` fillets.
**Color operations apply in the order written**: a later `colorNoise` / `paint` covers earlier ones, so put the must-show paint last.
**Hollow objects**: `lathe(outline).shell(0.04).cut(halfspace('-y', topHeight - 0.03))` gives a wall 0.04 thick, open at the top.
Paint the inside with `.paint(lathe(outline).round(-0.015), '#dark')` (a slightly shrunken copy selects the inner wall).

## Scene & parameters
`scene({ light: 'studio'|'sunset'|'daylight'|'night', ground: true, background: '#hex', exposure: 1, zoom: 1, step })`
`param('name', default, min, max)` — returns a number and adds a slider in the studio.
Helpers: `rand(seed)` (seeded random, `.range(a,b)`, `.pick(arr)`), `range(n)`, `lerp`, `clamp`, `rad`, `PI`, `TAU`, plus all of JavaScript (`for` loops, arrays, `Math`).

## Craft rules for high-quality models
1. **Block out big forms first** (3–6 shapes), check the silhouette, then add secondary forms, then small details.
2. **Blend organics with `add(part, k)`** where k is 10–30% of the smaller part's size. Hard-surface parts use small k (0.005–0.03) or `box(..., round)`.
3. **Model one side and `.mirror('x')`** for anything symmetric. Use `.ring(n)` / `.grid()` for repeats — they cost nothing.
4. **Proportions**: measure from a reference size (e.g. head = 1 unit) and derive every other size from it with variables.
5. **Layer detail at three scales**: primary masses, secondary forms (panels, muscles, rims, lids), tertiary detail (bolts, seams, grooves with `cut(..., small k)`, `displace` with small amount).
6. **Color with intent**: 2–4 main colors, one accent. Use `paint` for markings, `colorNoise` for natural surfaces, `glow` sparingly for eyes/lights.
7. **Keep parts touching or overlapping** so the model is one solid piece (important for 3D printing).
8. Prefer `capsule` / `ellipsoid` / `tube` for organic shapes and `box(..., round)` / `cylinder(..., round)` for manufactured ones.
9. Performance: under ~150 primitives is smooth. Use `mirror` / `ring` / `grid` instead of duplicating parts.
10. `displace` with large amount × scale, `twist` and `bend` make the field inexact and slow the preview; keep them moderate.
11. Look at the model from all sides (front, side, back, three-quarter) before calling it done: back and underside are where models look unfinished.

## Complete example
```js
// Mushroom cottage
scene({ light: 'sunset' });
const capR = param('capR', 0.78, 0.55, 1.0);
const stem = capsule([0, 0, 0], [0, 0.78, 0], 0.34, 0.27)
  .displace(0.008, 10, { octaves: 3 })
  .color('#efe3cc', 'satin').colorNoise('#d9c7a6', 6, 0.5);
const cap = ellipsoid(capR, capR * 0.58, capR).move(0, 0.9, 0)
  .cut(ellipsoid(capR * 0.92, capR * 0.3, capR * 0.92).move(0, 0.62, 0), 0.08)   // hollow underside
  .color('#c8372d', 'glossy')
  .paint(sphere(0.13).move(capR * 0.45, 1.12, capR * 0.45).mirror('x'), '#fff4e2', 0.012);
const door = box(0.22, 0.36, 0.3, 0.1).move(0, 0.18, 0.34).color('#5b3a22', 'satin');   // colored cutter paints the hole
const win = cylinder(0.065, 0.2).rotateX(90).rotateY(40).move(0.22, 0.55, 0.22).color('#ffcf6b', 'glow');
const tuft = cone(0.03, 0.001, 0.2).rotateZ(12).move(0.46, 0.08, 0).color('#6f9e3a', 'satin');
return stem.add(cap, 0.06).cut(door, 0.015).cut(win.mirror('x'), 0.01).add(tuft.ring(14), 0.02);
```
