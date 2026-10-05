# shimotron

Browser 3D engine (Three.js r186 + cannon-es, Vite single-file builds) with a Hebrew editor, and **Shimotron Rally**, the racing game built on it. Source of truth: [`shimotron/`](../shimotron), its README (Hebrew, very detailed) and the code.

## Layout

- `src/engine/`: engine (terrain, Gerstner water `world/Water.js`, sky, particles `fx/Particles.js`, physics wrapper, materials).
- `src/race/`: the game.
  - `config.js`: race rules, car types, AI, and `STAGES` (one entry per island).
  - `World.js`: `WORLD.layout` (island positions round the city hub), bridges, the far stand-ins.
  - `Island.js`: builds an island (terrain → track → city/trail/canyon/wilds → flora → colliders → life → volcano).
  - `Track.js`: circuit geometry, road profile `h[]`, jumps, gorges, rails, colliders.
  - `Vehicle.js` + `Solid.js`: RaycastVehicle car and its continuous collision guard.
  - `Colliders.js`: static shapes for cars, plus a grid for craft.
  - `Wilds.js`: the waterfall island's hazards.
- `tools/`: node and Playwright checks and bakers.
  - `crashtest.mjs`: cars into obstacles; checks penetration and impact speed.
  - `solidaudit.mjs`: drawn mesh vs collider, per island.
  - `racesim.mjs`: headless AI race.
  - `plans.mjs`: bakes `src/race/plans.json`; run after changing a stage.
  - `models.mjs`: real car models to GLB LODs.
- Builds: `npm run build:race` gives `dist/race.html` (committed; that is the playable file).

## Notes

### 2026-10-04: physics pass, sea, real hypercar, eighth island (branch `claude/rally-island-sea-physics-k65qtx`)

**Physics.** Cars used to drive into things: 99 of 216 crash-test runs ended up inside the obstacle.
- `Solid.js` sweeps the chassis boxes against static and kinematic boxes and spheres before integration, then answers the hit with its own impulse.
- Crash test now: 0/216, and cars hit at the speed they arrived.
- Colliders were added or fixed for trackside props, rocks, trees (sized from the mesh band), canyon pieces, city landmarks, the spaceport, round towers and trail tyres.
- `Colliders.post` is now an octagon, within 4% of the circle in both directions.
- Rail colliders follow the drawn rail sections exactly.

**Audit, still open:**
- Rocks: 2–3% of points are still outside their sphere colliders, up to about 2 m on irregular rocks. A sphere is a poor fit for a flat or long rock.
- Tunnel: 0.5 m gaps in two places.
- Life animals and balloons were never audited.
- `solidaudit` skips by name: trail stakes (they bend away), start gates (they lie flat after the start) and streets (drivable surfaces).

**Overlaps fixed** (things drawn passing into each other):
- The lowest Ferris-wheel cabin sank into its platform; the hub was raised.
- The spaceport's fuel tanks ran through each other.
- The launch apron floated above the ground; it is now a plinth.

**Sea.**
- 8 Gerstner waves. The CPU `waveAt` loops over the same `WAVES` and `SWELL` arrays, so boats still match the drawn surface.
- Added: sun glitter, crest glow, near-camera wind ripples, and foam lines downwind.
- The total horizontal steepness stays under 1, so crests never loop.

**Real models.**
- The hyper car is the three.js `ferrari.glb` (CC BY 4.0). It is Draco-compressed, so the pipeline needs `draco3dgltf`.
- The source is modelled double-sided and split at every hard edge, so meshopt simplify did nothing. `remesh()` re-welds it by position, drops the back faces and rebuilds creased normals; it went from 330k to 69k/11k triangles.
- `models.mjs` now takes per-model wheel-name maps, a yaw, material renames and a CLI filter: `node tools/models.mjs hyper`.
- Other car types: GitHub was the only reachable host. The user chose to open network access in the environment settings (Kenney, Poly Haven, Quaternius, Sketchfab…). Not done yet.

**Island 8, `falls` (אי המפלים)** at `[-2450, -4244]`; `WORLD.span` went from 9400 to 11600.
- Active volcano in the middle, two mossy-basalt gorges (`gorge.rock` tints Canyon's rock), and 3 table-top jumps added into `Track.h` (`Track._jumps`).
- `Wilds.js`:
  - waterfalls with pools, mist and a rainbow;
  - rockfall zones, with barriers opened through `track.gaps`;
  - lava flows that cross the road on causeways. `burns()` sends a car that leaves the road into the lava back to the track (Race.js);
  - an eruption every 22–38 s, with kinematic lava bombs that land around the player.
- Every moving rock is a KINEMATIC cannon body moved by a `preStep` listener, so `SolidGuard` sees it.
- Racesim, 150 s with 6 cars: no respawns or flips through the jumps.
- `plan()` must run before `track.build` (it adds the barrier gaps).
- Canva image generation was out of quota, so there are no Canva billboards yet.

**Gotcha.** Three r186 declares the `uv` attribute only when a material has a texture map. Custom shaders on map-less materials need their own attribute (Wilds uses `fuv`).

### 2026-10-05: waterfalls you can see, streams, shallow-water fish

- **The user saw no waterfalls.** The old code looked for a natural cliff; the falls island has almost none (11,205 of 11,254 probe sites had no steep descent), so each "fall" was a wet stripe draped down a slope 70-90 m off the road.
- **Fix:** `Wilds._planFalls` now picks sites on the slope above the road and `Wilds.carve` (chained into `terrain.heightModifier` in Island.js) shapes the ground. It raises a bluff behind the lip and cuts a plunge basin in front of it. The result is 6 falls, 17-25 m tall, 67-135 m from the road, facing the driver.
  - `_curtain` builds a free-falling sheet.
  - `_streamGeos` draws a feeder stream along the bluff and an outflow stream to the sea, skipped where it would cross the road.
  - `Wilds.splat` paints the cliff and basin as rock.
- **Ground cache:** `Island.groundKey` now includes `wilds.groundKey()`, so the baked or cached ground is invalidated when the falls move.
- **Fish were invisible from the road.** Every species lived below 1.5 m and most were much deeper.
  - Five shore species were added in `Sealife.SPECIES` (`shore: true`): mullet, needlefish, sergeant major, goatfish and convict tang, with patterns 11-13 in `FISH_PATTERN_GLSL`. Mullet and needlefish have `leap: true` and jump clear of the surface in `Life._updateFish`.
  - `Life._fish` reserves 40% of schools for the shallows, because random points rarely land in that thin band. `_relocateFish` tries 40 times for shore schools.
