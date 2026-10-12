# shimotron (שימוטרון)

Browser 3D engine (Three.js r186 + cannon-es) with a Hebrew editor, and two games built on it from the same sources:

- **Shimotron Rally** (`dist/race.html`, `vite build --mode race`): the seven-island archipelago with bridges to a city hub, every vehicle kind, championship, career, free roam, space.
- **ראלי האיים / Rally Islands** (`dist/rally.html`, `npm run build:rally`): five rally stages, one rally car, pace notes, stars, recorded sound effects.

- **Run:** open the file in `dist/` directly (single self-contained HTML each). `#low`/`#medium`/`#high`/`#ultra` in the URL forces quality.
- **Build:** `cd shimotron && npm install && npm run build` (engine + race) or `npm run build:rally`. vite + vite-plugin-singlefile; `vite.config.js` picks the entry by mode (`race`/`usb` → race.html, `rally` → rally.html).

## Layout

- `src/engine/` — engine (render pipeline, atmosphere, terrain, water, physics, particles, `audio/AudioEngine.js` procedural audio + `sample()` for recorded takes).
- `src/race/` — the game. `main.js` (Game: boot, menu, islands, launch, events, results), `config.js` (all numbers; `EDITION`/`RALLY`, `STAGES` = world or rally list), `World.js` (layout of islands, stand-ins, bridges), `Island.js` (one island in full; `surface(x,z)`), `Track.js` (road mesh + shader, curbs, barriers, AI speed profile), `Car.js` / `CarAudio.js`, `Race.js`, `ui.js`, `Rally.js` (rally edition extras).
- Circuit plans are baked: `node tools/plans.mjs` → `src/race/plans.json`, `node tools/plans.mjs rally` → `src/race/plans-rally.json`. A stage whose plan signature changed searches at run time instead (slow), so re-bake after touching a stage's `seed`/`island`/`track`.

## Rally edition (ראלי האיים)

- **Edition flag:** vite `define` sets `__SHIMOTRON_EDITION__`; `config.js` exports `EDITION`, `RALLY` and `STAGES = RALLY ? RALLY_STAGES : WORLD_STAGES`. Node tools set `globalThis.SHIMOTRON_EDITION` before a dynamic import. Rollup folds the flag, so the rally build drops the glTF concept car (2.3 MB vs 5.6 MB).
- **Stages** (`RALLY_STAGES`, each its own island on a ring in `WORLD.layout`, no hub so no bridges or spaceport): נמל הדייגים (asphalt, golden hour), רכס האורנים (gravel, morning fog), כביש הצוקים (asphalt, noon), חוף הדיונות (sand, sunset), מכתש הגעש (mixed, night with lava). Stage fields added: `road`, `looseColor`, `music` (a `MUSIC_STYLES` key), `darkDust`.
- **Loose road:** `Track._looseMap()` gives each sample a 0..1 loose amount (`mixed` = three gravel sections, start straight tarmac). The road shader blends to gravel/sand by the `aLoose` attribute (stones, ruts, berms, no paint), curbs are dropped on loose samples, and `Island.surface` returns `stageGravel`/`stageSand` with grip in `carContext().surfaceGrip`.
- **Pace notes:** `PaceNotes` grades corners from `track.kappa` (radius → 1 hairpin … 6 flat; kappa > 0 = right), shows the next call with distance and "ואז …" on screen, chime per call. No speech.
- **Stars:** finish, podium, gold time (`goldTime`: laps × length / pace per surface). Stored in localStorage under prefix `shimotron-rally-islands` (separate from the archipelago's `shimotron-rally`).
- **Sounds:** ElevenLabs takes in `assets/raw/sfx/`, `tools/process_sfx.py` → `assets/sfx/<name>_<n>.mp3`, inlined by the `virtual:shimotron-sounds` vite module (rally mode only) and played by `AudioEngine.sample()`. Effects: gravel, ping, land, crash, backfire, chime, crowd. Licence log in `assets/sfx/CREDITS.md`.

## Notes

- **2026-10-12, rally edition built** (branch `rally-island`). Owner asked to build the next game end to end; plan doc: https://claude.ai/code/artifact/0780982c-0bb1-47fe-898f-59fce49eb56a. The plan said "one island, five tracks"; built as five islands instead because `World`/`Game` assume one stage per island (neighbours, LOD, preload) and overlapping islands at one spot would need a solo mode. Still open: time trial with a ghost, unlocking stages in order.
- **ElevenLabs rate limit:** many generation calls returned 429. Per the repo rule they were not retried; the nitro sound has no take (synth stays), several sounds have 1–3 takes instead of 4.
- **QA caveat:** in the container's swiftshader Chromium the game runs at about 1–2 fps, so the menu takes ~8 s and a race takes minutes to reach the green light. Time-to-menu must be judged on a real GPU; the rally boot waits at most 0.9 s for shader compile before showing the menu.
- `tools/plans.mjs` (world) currently produces a different `plans.json` than the committed one (pre-existing drift, not re-baked here).
