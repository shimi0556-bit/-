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
