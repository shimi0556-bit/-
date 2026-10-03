# shimotron

Browser 3D engine (Three.js r186 + cannon-es) with a Hebrew editor, plus **Shimotron Rally**, a racing game on seven procedural islands. Almost everything is generated in code at load time (terrain, textures, cars); the only real asset is one glTF car (`src/race/models/concept*.glb`, already meshopt-compressed by `tools/models.mjs`).

- **Run:** open `dist/race.html` (game) or `dist/index.html` (engine + editor) straight from disk; `npm run dev` for live reload
- **Build:** `npm run build:race` → one self-contained `dist/race.html` (vite-plugin-singlefile); `npm run usb` also bakes the islands' ground in (`tools/bake-ground.mjs`, ~1.6× faster load) and zips `dist/Shimotron-USB.zip`
- **Measure loading:** `node tools/loadtime.mjs [page.html]` (headless Chromium, SwiftShader: compare runs, not absolute numbers)
- Loading flow lives in `src/race/main.js` (`boot`, `_startBgBuild`, `_preloadIslands`, `_finishWorld`, `_launch`)

## Notes

- **2026-10-03, slow first race.** Loading is CPU work, not downloads: the menu is up in ~4 s (headless), but each island takes ~6–12 s to build and the first race used to wait for all seven (`_finishWorld` awaited the whole background build), ~45 s headless. Changed so a race waits only for its own island (built next, ahead of the others); the rest build only while the menu is up, never during play, because `Island.build` changes the sky, sea and physics world. Free roam still waits for the whole world so travel between islands stays seamless. Headless: menu → race 44.5 s → 32 s.
- **What is left:** after the island, most of the remaining wait is shader compilation (a synchronous first frame after the build, then `compileAsync` for the race), ~18 s under SwiftShader, much less on a real GPU. 
- Compressing models/textures or splitting the bundle would not help much: there are no image files, the one model is already compressed, and the single-file build is deliberate (opens from disk / USB).
- **2026-10-03, "bake the whole world into the USB build?"** The user asked to pre-bake everything so the USB version needn't build at load. A CPU profile of the USB build's background build (all 7 islands, headless) showed only ~14 s of 57 s is JavaScript work that could be stored in the file; ~44 s is the main thread idle, waiting on the (software-emulated) GPU: frames, shader compiles, texture bakes. So on a real GPU the proportions are unknown. Added `#timing` (`src/race/Timing.js`): a panel with per-step / per-island load times, to get numbers from the user's own computer before deciding on a full world bake (which would mean serialising flora, city, reefs and physics from ~26k lines of procedural code).
