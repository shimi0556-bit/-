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

### 2026-10-09: island 9 "cross" (חוצה האיים), sea tunnels, monster 4×4s, real fish

- **Artifact link loaded no real models.** The claude.ai sandbox refuses `fetch` of `data:`/`blob:` (and maybe WebAssembly). Models are now `.glb.gz` (no meshopt); `RealModels.parseGz` decodes base64 by hand + `DecompressionStream`, and the `inlineImages` GLTFLoader plugin decodes textures with `createImageBitmap`. Test it under a strict CSP, not from `file://`.
- **Stage `cross`** (index 8, layout `[3100, -4500]`, span 12800): main island plus two islets (`island.islets` in Terrain.js), course drawn by hand (`track.controls`, `TrackGenerator` returns it as is), 6 km.
  - `Track._tunnels`: wet runs become glass tubes on the sea floor (depth 13 m); `sunk`, `tube`, `ramps`, `tunnels[]`, `inCut`, `inTunnel`, `nearTunnel`. The floor follows the road's bank and is flat out to W+9 (coarse heightfield otherwise lifts triangles into the road).
  - `SeaTunnels.js` builds the glass, walls, plinths, LED strips and ribs; `Water.setDry` cuts the sea surface out of the ramps. Race/racesim do not count a car in a tunnel as drowned.
  - `Track._offroad(ranges)`: packed-dirt stretches (`dirt[i]`) with long rolling bumps. Short bumps (8.5 m wavelength at 3.5 cm) gave crest curvature up to 0.05/m and launched trucks; now 32 m / 17.5 m waves dominate.
  - Reefs (`Life._reefCell`) keep off `track.nearTunnel` (a coral bommie grew inside a tube).
- **Monster 4×4** (`CAR_TYPES.monster`, `MonsterTruck.js`, body from Kenney CC0 via `tools/monster.mjs`): giant lugged tyres, coil-over springs that squash with the suspension, tilting solid axles. `stage.vehicle = 'monster'` makes everyone drive it on `cross` (`main.roster`). Grip 1.38 and antiRoll 18: at grip 1.55 the tall truck rolled over in R~130 m dirt bends (lateral g above track/CoM height). Racesim 6 trucks × 280 s: 0 respawns, 0 flips.
  - Raycast wheels do not collide: the giant tyres rolled through rails and parked cars (crashtest NO IMPACT / PASSED THROUGH). `spec.extra` adds boxes round each axle (also fed to `SolidGuard`), and `spec.skidY` lifts the floor skid spheres (the soft springs squat so far that the default spheres scraped the ground and braked the truck). `Vehicle.place` lifts a car that rides higher than ~0.6 m. crashtest now covers `monster` (288/288 ok).
  - The tube is solid all round: the plinth wall plus tiers stepping in under the arch and a roof box (`SeaTunnels`). A tier's face is where the glass is at the tier's top, else a tall truck rubs an invisible wall. racesim now builds the tunnel colliders too.
- **TunnelLife.js** (`life.tunnels`): per tube a humpback looping round it (over the roof at the ends), hammerheads and big sharks circling above the roof, and shoals of real barramundi (Khronos sample, CC0, `tools/fish.mjs`) beside the glass. Only on the deep part of the tube (h < -12.4) so nothing touches the glass.
- **Waterfalls** (`Wilds._curtain`): three layers (sheet, white ropes in front, wet film on the rock), streaks that speed up as they fall, splash spray at the foot and a mist plume; pools churn with noise. Terrain shader: dry patches in grass and moss on rock ledges (all islands).
- Open: Sketchfab/Poly Haven models still need the custom network environment.

### 2026-10-09 (afternoon): rally across all islands, junctions, stream sources, real car kits, photo ground

- **Rally across every island** (`Rally.js`, menu button `rally-btn`): explore mode with gates. Order `[hub, ...WORLD.ring, hub]`; a gate at each bridge pylon (r 10) and on each ring island's circuit midway between its arrival and departure spur joins; finish at the city spur join. Clock starts on first movement, gates count only with wheels down, best time in store key `rallyBest`. HUD box `.rallybox` (arrow, time, gate, km) and minimap dots.
- **Ring bridges** (`WORLD.ring`): neighbouring islands are now joined to each other, not only to the city. `World._landing(st, ang, all)` returns candidate landings all the way round the coast when `all`; `_bridges.link` tries pairs (16×16, sorted by deviation) and takes the first whose deck keeps 40 m off every circuit (`_deckClear` returns the minimum clearance), else the one with the most. Diagnostic: `world.bridgeLog`. Before this, lagoon→lava and ice→pines decks crossed a circuit 3 m above it (no valid landing near the ideal line, so an unchecked fallback was used); now every deck keeps at least 86 m off every circuit.
- **Bridge decks are an analytic surface for the wheels**: `Explore._decks` gives the island `deckLines` (polylines from the bridge samples), `Island.deckY` walks them, `pavedY` falls back to it. Deck profile: 10 passes of [¼,½,¼] smoothing with ends fixed, never below ground+0.35.
- **Junctions** (`AccessRoads.js` rewrite): spur runs straight off the deck (`run` 10–40 m), then to a join chosen along ±320 m of circuit by length + grade (×2500 over 7%) + turn radius + bend off the deck. Even-grade profile `ramp()` (max ≈1.25× average); spur grades now ≤ ~9% (were up to 24.6%). Mouth: quarter-circle flare (`FLARE` 9 m), surface blends into the circuit plane over `BLEND` 20 m, road stops at the circuit edge. Track: `aGap` attribute breaks the edge line and kerbs at the mouth (`inMouth`, gap `open`), give-way dashed line. Same asphalt material as the circuit.
- **Stream sources** (`Wilds._planSource`): each fall's stream starts at a spring pool at the foot of a crag, up to 150 m back, winding (`_srcLat`) down a raised valley (`_srcHalf`) in a carved flat-bottomed channel. The channel must be wide for the ground grid (falls island: 2400 m / 520 = 4.6 m a cell): `cw = max(6.5, w·0.45+2.5)`, flat to 0.6·cw. Level water ribbons (`_ribbon(…, level)`, 9 columns): surface = mesh bed + 0.75, smoothed along, clamped to stay 0.1 under the lower bank at the ribbon's edges (≥ bed + 0.12); a narrow V channel drew as a sawtooth. Calm-water material (`_fallMaterial(false, true)`, cache key `wild-streams-calm`) is clear and darker with depth (`fdepth` attribute) and fades out where shallow, so the shoreline is not the mesh's facets. Outflow streams are draped on the ground with a point every 2 m.
- **Jeeps/monsters**: wheel spin is shown, not simulated (`Vehicle.showSpin`, `wheelShown`, capped per frame so fast spins don't strobe backwards). Air control yaw torque when airborne. Monster tuning: travel 0.66, stiffness 15, damp 2.6/2.3, grip 1.38, accel 12, top 56, steer 0.56, yaw assist 0.55, antiRoll 22 (softer tuning flipped 6 times in racesim). Racesim cross 6×240 s: 0 respawns, 0 flips; crashtest 288/288.
- **Real car models** (`tools/carkit.mjs` → `models/kit-*.glb.gz`, 15–33 KB): gt/rally/muscle from rgsdev, buggy/formula from Kenney (CC0). `RealModels.prepareKit` turns nose to +z, scales to the wheelbase, finds wheel nodes and swaps materials (clearcoat paint, glass, rubber, metal rims, emissive lamps). Buggy/formula keep their atlas colours. The moto keeps its procedural model (the downloaded dirt bike was cruder).
- **Photo ground** (`tools/photos.mjs` → `textures/*.jpg`, `PhotoTextures.js`, 1.3 MB): Poly Haven CC0 grass/rock/sand/dirt/asphalt/bark blitted into the TextureBaker targets (`baker.blit`, decodes sRGB first). The only grass photo was dry straw: `photos.mjs` recolours it to the old procedural green keeping 35% of its own tint, and tones the gravel's red down. Road skirts now carry the texture down their face (UV from the unclamped lateral; it was smeared).
- `plans.json` now carries a baked plan for `cross` (the world had no `trackPts` for it).
- Spring boulders hung in the air on the steep crag: they were seated on the lower of two ground samples; now on the lowest of 9 across their footprint (radius 1.3·s).
