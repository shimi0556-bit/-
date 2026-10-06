# iron-hawk-3d (נץ הברזל)

Browser 3D fighter-jet game against giant monsters, written from scratch in this repo. Hebrew RTL menus and HUD; keyboard/mouse, touch and gamepad.

- **Run:** open `iron-hawk-3d/index.html` directly (single self-contained file, about 1.3MB, works offline). Also a card in the root launcher (`index.html#ironhawk`).
- **Build:** `cd iron-hawk-3d && npm install && npm run build` (`npm run dev` = unminified). `tools/build.mjs` bundles `src/main.js` with esbuild (IIFE) and inlines CSS, Rubik/Karantina fonts, `assets/img/*` and `assets/sfx/*.mp3` as data URLs into `src/index.html` → `index.html`.
- **Stack:** Three.js r186 only. Post chain: Render → UnrealBloom → Output (ACES) → grade → FXAA.

## Layout

- `src/world/` — `sky.js` (physical Sky + IBL bake + fog colour read back from the horizon), `terrain.js`, `water.js` (water and lava), `vegetation.js`, `clouds.js`, `levels.js` (the three regions: valley, canyon, volcano).
- `src/actors/` — `jet.js` (quaternion flight model), `species.js` + `creature-mesh.js` (procedural skinned monsters), `monsters.js` (AI, hit spheres, boss), `weapons.js` (cannon with lead assist, lock-on missiles), `pickups.js`.
- `src/core/` — render, camera rig, input (keys/touch/gamepad), audio, procedural textures.
- `src/ui/` — `hud.js` (canvas HUD), `menus.js` (screens). `src/main.js` is the game loop, missions, scoring, pause/results.
- Content rules from the owner: monsters are just monsters (no prehistoric lore), no pop culture, no people/women in art, sound effects only (no voices or songs).

## Notes

- **2026-10-06, first full version.** Three regions (העמק הירוק: 14 kills; הקניון האדום: 18 kills; הר הגעש: boss מלך הלבה with 3 crystals then the heart). Stars: win = 1, ≤1 death = 2, no deaths within par (6/8/9 min) = 3. All regions open from the start.
- **Sounds:** 19 SFX generated with the ElevenLabs connector, trimmed/normalised by `tools/process_sfx.py`, files in `assets/sfx/<name>_<n>.mp3` (variants grouped by name). Never re-run a generation call to retry; each call costs credits.
- **Images:** `tools/gen_images.py` (reads `GEMINI_API_KEY` from env only; never commit the key). No Gemini images arrived yet, so region cards use CSS art and all textures are procedural. Drop finished images into `assets/img/` and rebuild; `levels.js` `image` keys pick them up.
- **Sky/bloom lesson:** the physical Sky shader is far brighter than lit ground, and bloom reads pre-tonemap HDR, so everything turned into white haze and objects looked pale/mint. Fix: `uSkyScale` scales the sky (and with it the baked env map and measured fog colour), `uSkyKnee` soft-caps sky luminance at 2×knee, the sun disc is capped, and `bloom.threshold = knee * 2.15` (render.js `setLevelLook`). Clouds take `horizonLum` so they don't go brown or glow. Per-level `sky.scale`/`sky.knee` (volcano uses 0.25/0.55).
- **Boss NaN:** boss spec was missing `girth`, so the heart sphere radius was NaN; aiming at it made the jet position NaN and threw a non-finite AudioParam error. Fixed with `girth: bossP.girth` in species.js.
- **Boss weak points:** cannon lead and missile homing aimed at the body centre, which is armoured while crystals live. `monsters.aimPoint()` returns the weak sphere closest to the aim ray; splash damage skips non-weak boss spheres.
- **After a win** the jet flies an autopilot climb, is invulnerable and can't crash, so a post-win crash no longer counts as a death.
- **Mobile black screen:** CSS `.touch{display:none}` also matched `body.touch` (the class added on touch devices). Renamed to `#touch`. Don't reuse `.touch` as a component class.
- **Phone layout (844×390):** screens centre with `margin:auto` on first/last child instead of `justify-content:center` (that clipped the settings back button); briefing and atlas go two-column in short landscape; HUD radar and touch weapon bar moved below the lives row and objective.
- **QA caveat:** in the container's swiftshader Chromium the game runs at a few fps and `dt` is clamped, so real-time Playwright runs show false bugs (intro title never fading, 0 kills, screens stuck at opacity 0 at high quality). Use a fixed-step harness instead: replace `g.frame` with a no-op and loop `g.updatePlaying(1/30)` from `page.evaluate`, injecting keys via `g.input.down`; force `localStorage['ironhawk.v1.settings'] = {"quality":"low"}`.
- **Open:** not yet tested on a real phone/GPU; Gemini art still pending.
