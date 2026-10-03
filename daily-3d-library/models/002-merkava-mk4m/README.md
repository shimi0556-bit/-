# #002 · Merkava Mk 4M (IDF main battle tank) · טנק מרכבה סימן 4M

The IDF's main battle tank, modelled procedurally in [`model.js`](model.js). Open [`index.html`](index.html).

**231 named parts in 11 systems, ~950 meshes, ~280K triangles, no model or image files.**

## What's modelled

| System | Detail |
|---|---|
| Hull | Welded hull from a side profile extruded for both sides, shallow V-shaped belly with stiffening ribs, low-slope lower glacis, nose and upper glacis, engine deck, roof with the turret-ring hole, rear plate frame. Rear door on 3 hinges with stiffeners, 3 latches + handle, 18 bolts, tail lamps. Engine intake louvers (10 slats), exhaust grilles, fill caps with chains, driver hatch with collar and 3 periscopes, front tow eyes, rear shackles, lifting lugs, headlamps with guards, sponson shelves with ribs and bolt rows, front and rear fenders |
| Armour | 12 hinged side skirts (plate, 3 ribs, 6 bolts, lifting handle, rubber flap each) on hinge bars; 22 bolted turret armour modules (side, centre, front, cheek, rear) with 6 bolts and a spacer rib each; chain curtain behind the bustle: 31 chains × 5 links + ball weights on a bar |
| Turret | Ring bearing (steel race, gear ring with 90 teeth, 48 bolts), turret skirt, wedge-shaped shell (flat rear roof, sloped front roof built by bending the extrusion), roof plate with weld bead, rear plate, commander cupola (8 periscopes, hatch lid, seal ring, bolts), loader hatch |
| Gun & weapons | 120 mm MG253: mantlet with dust boot, tube, cradle sleeve, thermal sleeve with 9 clamp bands, bore evacuator with 4 pipes, muzzle reference system, breech, 2 recoil cylinders, data plate, coaxial MAG; commander MG, loader MG with shield, small remote weapon station that sweeps while driving |
| Optics & comms | Gunner sight head (day + thermal windows, hood), commander panoramic sight, 8 periscopes, loader periscope, 4 laser-warning receivers, 2 whip antennas and a GPS puck |
| Trophy (“מעיל רוח”) | 4 flat radar panels with patch-antenna grids and green status LEDs, 2 interceptor launchers that rise and turn outward when armed (toggle), cable harness, control unit with cooling fins |
| Tracks | 2 × ~80 individual links (rubber pad, steel plate, end connectors, guide horns, pins) moving on a closed path; drive sprockets (2 rings × 14 teeth, bolt rings), final drives, rear idlers with tensioner arm and adjusting screw |
| Suspension | 12 road wheels (dual rubber rims, steel discs, 20 nuts each), 12 trailing arms with pivots and bump stops, 12 external coil springs, 12 telescopic shocks, 8 return rollers |
| Power pack | GD883 V12: crankcase, sump, two banks with 12 valve covers and bolts, exhaust manifolds, manifold, fuel-injection lines, twin turbos, cooling fan (spins while driving), radiator with 34 fins, mounts, air cleaner with 12 cyclones; RK325 transmission, torque converter, disc brakes, cross-drive shaft, fuel tank, 4 batteries, exhaust |
| Crew | Turret basket with floor, slip ring and grating, 4 sculpted seats (soft-body cushions, backs, headrests, armrests, posts), 3 turret consoles with labelled buttons, knobs and guarded toggles, driver steering wheel, pedals, dashboard with labelled buttons, 3 radios with panels, ready rack (4 rounds), 32 rounds in racks in the rear hull, 3 fire bottles, NBC unit, stretchers |
| Equipment | Tow cables with eyes and clamps, shovel and sledge, 3 jerrycans, rear stowage boxes, 2 × 8 smoke launchers, mud flaps, tactical numbers on the turret, hull data plate |

Toggles: turret traverse, gun elevation, hatches, rear door, side skirts, running tracks (every link, road wheel, sprocket and roller turns with the right speed; the engine fan spins), Trophy armed, lights (night mode turns them on).

## Upgrades over #001

1. **Wear & dust paint** (`dusty()` in `model.js`): value-noise patches and fine grain in object space, and dust that fades in by world height, so the lower hull, skirts, wheels and tracks are dustier than the roof. Works on instanced meshes too. (The old build used flat `M.paint`.)
2. **Living mechanisms:** closed-path track kinematics (one arc-length parameterisation drives the links, wheels, sprockets, rollers), turret traverse and gun elevation that carry every roof item with them, Trophy launchers that rise.

## Sources & accuracy

Public figures: hull 7.6 m, 9.04 m with the gun forward, ~3.72 m wide with skirts, ~2.66 m to the turret roof, ~65 t (~70 t with Trophy), GD883 V12 ~1,500 hp, 120 mm MG253, 6 road wheels per side. Sources: [Wikipedia](https://en.wikipedia.org/wiki/Merkava), [Army Technology](https://www.army-technology.com/projects/merkava4/), [Defense Update](https://defense-update.com/20060803_merkava4.html), [WeaponSystems.net](https://weaponsystems.net/system/499-Merkava+4), [Armored Warfare](https://armoredwarfare.com/en/news/general/development-merkava-mk4m-windbreaker).

Armour thicknesses, internal layout, ammunition arrangement and the exact radar/launcher positions are informed reconstructions from public information, not a drawing.

## Known simplifications / open

- The ammunition is 32 rounds in the rear racks + 4 ready rounds (the real tank carries ~48).
- The chain curtain is short (5 links) so the open rear door doesn't sweep through it.
- The turret-mounted gun, optics and Trophy parts ride inside the turret group, so the exploded view lifts them together with the turret.
