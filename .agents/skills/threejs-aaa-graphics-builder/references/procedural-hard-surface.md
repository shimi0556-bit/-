# Procedural hard-surface & interior detail (local lessons)

Learned building `daily-3d-library` #001 (a fully procedural presidential limousine, 246 parts). The user's verdict on the first pass was "too many geometric shapes, no buttons", so these are the fixes that turned boxes into believable objects.

## Forms
- **Body panels from parametric surfaces.** Write a section function `S(x, v)` (lower body + greenhouse) and grid it with shared break points. Doors, hood, trunk and glass are patches of the same surface, so holes and patches line up exactly. Solidify the patches with a thickness, and give the rim walls a black material so they read as shut lines.
- **Sculpted boxes for anything soft or touched.** Use a finely subdivided `RoundedBoxGeometry`, push vertices in normalised [-1,1] coordinates (bolsters `+side·h`, lumbar Gaussian, centre sag, shoulder taper), then re-average normals across the face seams. Seats, armrests, consoles, mirror housings, airbag covers and pillows all come from this one helper (`G.soft` in `daily-3d-library/engine/kit.js`).
- **Keep the 6 face groups of the box** so a material array can put detail (quilting) on the seating face only.

## Materials
- **Quilted leather without geometry:** a 512² canvas colour map (pleat shading, groove lines, double thread stitches, perforation dots) plus a matching bump map, with `sheen` on a MeshPhysicalMaterial. It reads as real upholstery for ~0 triangles.
- **Dark paint needs a dark studio environment.** A bright `RoomEnvironment` turns black clear-coat into white. Build a PMREM from a dark gradient sphere with a few emissive soft-box strips, so the paint gets crisp highlight lines.
- **Emitters get their own material instances** so toggles (headlights, strobes, cabin lights) don't light up everything sharing a cached material.

## Controls make interiors believable
- A cockpit with no buttons reads as unfinished. Build **control panels** as a plate, real 3D caps (rect, round, knob, rocker, guarded toggle with a flipped safety cover), and ONE canvas texture of backlit labels per panel, placed at cap height (`emissiveMap` = the label texture). Orient them with `makeBasis(right, up, normal)` so text reads from the user's seat.

## Clearances (check with a cutaway)
- Leave room for a person: lower steering-wheel rim ≥ 4 cm above and ahead of the cushion front, seat backs clear of bulkheads, headrests below the glass.
- Nothing floats: a flat decal over a domed cap looks like it hovers. Seat logos in a bezel on a flat face, and close lathe profiles to r = 0.
- `ExtrudeGeometry` with a bevel grows the outline by `bevelSize`. Use `bevelOffset: -bevelSize` when other parts sit against that outline.
