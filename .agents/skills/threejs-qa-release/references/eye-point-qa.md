# Eye-point QA for detailed models (local lessons)

Overview shots passed while the user immediately found four defects in close-ups: a steering wheel inside the driver's seat, a wheel emblem that looked like it floated, box-like seats, and a cockpit without buttons. Overviews are not QA.

## Shot plan (every model, every change)
1. The standard set: front, side, rear, top, under, exploded, x-ray, cutaway, everything open, night.
2. **Eye points:** from the driver's/commander's head position, from the passenger seats, a close-up of a wheel or track, a close-up of the main control panel, and a cutaway through the occupant area.
3. Read every PNG yourself before claiming anything.

## Defect checklist
- Intersections: anything through the hood or roof or glass, a wheel or controls inside a seat, pipes crossing open cabin space.
- Floating: decals above curved surfaces, parts with no mount, cables with no anchor.
- Primitive-looking: bare boxes on seats, armrests, consoles, housings.
- Missing affordances: no buttons, labels or switches where a person would touch.
- Text: mirrored or upside-down lettering (tyres, engine covers, plates). Build left and right with a side parameter or a 180° rotation, never a negative scale.
- Flicker or streaks: shells closer than 8 mm.
- UI: the panel must not cover the title on a 390 px phone; the camera has to back off in portrait so the whole model fits; no `null` text from `Element.append(null)` (filter children first).
- Toggles: when the harness resets toggles between shots, restore each toggle's *initial* state (e.g. flags default on), and apply a view's own toggles (open the hood for an engine view) *after* the reset.

## Lessons from the Ford Model T (2026-10-04)
The user found two more defects that wide shots hid, and both were visible in the QA shots all along:
- **Stray parts:** two leaf springs floated 3 m in front of and behind the car (a mesh built away from its origin, then scaled). They were *seen* in the shots and dismissed as studio props. Rule: identify every object you can't name before moving on (raycast from the pixel, or list the meshes near that point).
- **Axis orientation:** the steering wheel leaned toward the windshield; the column lay in the wheel's plane. Derive the orientation from the shaft vector and check it in a pure side view.
- **Hinge direction:** a hood half opened *inwards*. Print each moving part's world bounding box before and after the toggle instead of judging from a shot.

Automated geometric pass (works for any Three.js scene with named groups; the reference script is `daily-3d-library/tools/sanity.cjs`):
1. Group meshes by their nearest named ancestor and compute a world `Box3` per group.
2. **Stray:** a group whose box is farther than ~0.4 m (scale to the scene) from every other group's box.
3. **Below ground:** box `min.y` < −0.01 for objects that should rest on the floor.
4. **Toggles / state changes:** apply each one, re-measure, and print the groups that moved with their centre shift; a sign error shows up as a shift toward the inside.
In a game, run the same pass on the level geometry and on spawned props after a state change.
