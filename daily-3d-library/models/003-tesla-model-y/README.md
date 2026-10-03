# #003 · Tesla Model Y (Juniper, 2025) · טסלה מודל Y

The 2025 "Juniper" Model Y, modelled procedurally in [`model.js`](model.js). Open [`index.html`](index.html).

**154 named parts in 11 systems, ~480 meshes, ~415K triangles, no model or image files.**

## What's modelled

| System | Detail |
|---|---|
| Body | One parametric section `sec(x, v)` with a superellipse plan-view nose, sloping fastback roof and wheel arches. Doors, frunk lid, liftgate and glass are patches of the same grids (`subX`/`subV`), so every panel sits exactly in its hole. Pillar-following patches (`band`) give smooth diagonal A- and D-pillar edges. Rocker cladding, front fascia with lower intake and active-shutter slats, splitter, rear diffuser, underbody aero tray, cowl, wipers and washer jets, cargo floor with sub-trunk, frunk tub with drain and carpet, washer reservoir, jack points, tow-eye cover, frunk latch |
| Doors | 4 frameless doors (outer skin, glass, door card with armrest, RGB ambient strip, speaker, window switches), flush handles, aero mirrors |
| Glass | Windshield with frit, single-piece glass roof with frit and header, quarter glass, liftgate glass |
| Lights | Juniper full-width front light bar, slim matrix headlamps with projectors and amber turn strips, C-shaped tail lamps, full-width rear light bar on the liftgate, CHMSL, reverse lamps, reflectors, cabin and ambient lights |
| Insignia | TESLA wordmark, Israeli licence plates, charge port with NACS pins, LED status ring, motorised flap and a charging connector + cable (toggle) |
| Wheels | 255/45 R19 tyres with grooves, 360 sipes and sidewall lettering; aero rims with 10 windows, polished lip, T centre cap, 5 lug nuts, valve stem; TPMS sensors |
| Chassis | Knuckles and hubs, double-wishbone front / multilink rear arms with bushings, coil-over dampers, toe links, electric steering rack with boots and column shaft, front and rear subframes, anti-roll bars, vented discs and calipers |
| Battery | Structural pack (floor, walls, lid with bolts), 4 modules × 264 cylindrical cells with tops, cooling ribbons, bus bars, BMS boards, HV "penthouse" junction box with pyro-fuse, orange HV cables to both drive units and the charge port |
| Drive | Rear PM motor and front induction motor with cooling fins and copper end windings, single-speed gearboxes, SiC inverters, half-shafts with CV boots, heat pump + Octovalve, radiator with fins and fan, 16 V Li-ion battery, HVAC module |
| Interior | Flat floor and mats, four sculpted quilted seats (60/40 rear split, folds), power-seat switches, dashboard with continuous vent slot, glovebox, 15.4" screen with map UI, round wheel with scroll wheels, column + stalk, console with 2 wireless chargers, cup holders, USB-C, storage bin, rear 8" screen, pedals, sun visors, auto-dimming mirror, belts, pillar trims, audio + subwoofer |
| Autopilot | Windshield camera cluster (3), B-pillar cameras, fender repeater cameras with turn signals, rear camera, front bumper camera, HW4 computer with cooling fins, antennas, cabin camera |

Toggles: doors, frunk, liftgate (with animated power struts), charge port + cable, lights, cabin lights, rear seats fold, drive (wheels and discs spin). Night mode turns the lights on.

## Sources & accuracy

Length 4.79 m, height 1.624 m, wheelbase 2.89 m, ground clearance 167 mm, 255/45 R19 tyres. Sources: [Wikipedia](https://en.wikipedia.org/wiki/Tesla_Model_Y), [Basenor](https://www.basenor.com/pages/model-y-juniper-dimensions), [EV Database](https://ev-database.org/car/3103/Tesla-Model-Y-RWD), [carsized](https://www.carsized.com/en/cars/tesla-model-y-2025-suv/). Width varies between sources (1.92–1.98 m without mirrors); the model uses 1.92 m. Cell layout, motors and interior are informed reconstructions.

## Reference photos (part-by-part comparison)

Compared against 19 photos of a Quicksilver Model Y Juniper (Dual Motor First Edition) on Wikimedia Commons ("Tesla Model Y Dual Motor First Edition Juniper Quicksilver (1)…(19).jpg"), front, side, 3/4 and rear, using `tools/refs.py` + `tools/shot.cjs`. Changes made from the comparison:

- Silhouette: roof now peaks just behind the windshield and falls in one continuous curve to the tail (was flat and sedan-like); windshield starts further forward; taller side glass; body sides tuck in toward the rocker.
- Nose: rounder plan and a hood that rolls down at the front; light bar moved up to the hood's leading edge; headlamps are small units in the corners under the bar ends; vertical black corner inlets; wide black lower intake and lip (the old splitter and centre plate holder were removed).
- Tail: thick black ducktail spoiler across the liftgate with TESLA lettering in it and the light strip under it; tail lamps tucked under the spoiler ends; black lower bumper that wraps around the corners; plate moved onto the black lower bumper.
- Wheels: silver swept-blade aero rims (were black); smaller wheel arches so the tyres fill them.
- Colour: darker, bluer Quicksilver; glass roof tinted almost black (frit bars on top removed).

Round 2 (camera-matched overlay): the camera of photo (10) was solved from the wheel rims, the model was rendered with the same camera and its outline drawn over the photo. The centre-line profile and the beltline are now tables of points measured off that photo (roof peaks 1.59 m at x ≈ −0.8, windshield base at x ≈ 1.06, hood falls to 0.75 m at the nose), the body section is barrel-shaped with a strong shoulder and tumblehome, the greenhouse narrows toward the tail, the lower intake is a full-width band, and the nose underside no longer sticks out.

Still clearly different (honest list): the nose is too narrow and pointed in plan view and the front face is not sculpted like the real one (no defined bumper corners); the rear window and liftgate are too wide and flat and the real rear haunches over the wheels are missing; the hood has a visible crease where the frunk lid meets the nose; the side surfaces lack the real door-panel feature lines; wheel-arch liners are not black. A single parametric section limits how close the body can get — the next step would be lofting the body from several measured cross-sections (front, B-pillar, rear axle, tail) taken from front/rear photos.

## Known simplifications / open

- The battery is only visible in the cutaway/x-ray (the aero tray covers it from below).
- The A-pillar glass shows strong studio reflections; on a real GPU with the full environment it reads as normal glass.
