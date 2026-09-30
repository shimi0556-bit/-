# jerusalem-dove

**יונת ירושלים** — Three.js 3D flight game: a dove flying over a stylized Jerusalem at sunset. Inspired by Yuval Avidani's "fly over NYC" Opus 5.5 demo.

- **Run:** open `index.html` (single self-contained file, three.js inlined, works offline except Google Fonts).
- **Build:** `npm i && node build.mjs` bundles `src/` with esbuild into `index.html`. If `assets/dove.glb` / `assets/music.mp3` exist they get base64-embedded.
- **Layout:** `src/world.js` (terrain `heightAt`, walls, landmarks, instanced neighborhoods + solar water heaters, trees, clouds, colliders), `src/dove.js` (procedural dove with segmented flapping wings, skins, GLB loader), `src/audio.js` (procedural Web Audio: wind, flaps, chimes, original Hijaz ambient loop), `src/main.js` (render pipeline, flight physics, collisions via spatial grid, letters/ring race, HUD, minimap, touch).
- **Coords:** +x east, −z north, Old City centered on origin (±240). Sun low in the west.
- **Gameplay:** collect 7 letters of ירושלים at landmarks → win screen + unlock gold skin (localStorage). Ring race starts at the green ring by Jaffa Gate; best time stored.
- **Test hook:** `window.__game.sim(n, keys)` steps the simulation without rendering — swiftshader in the container renders at ~1 fps, so playtests teleport + `sim()` instead of real-time flying.

## Notes
- 2026-09-30: v1 built. Verified with Playwright: all 7 letters collectible, win screen fires, no page errors.
- Custom hero model: user is generating a dove GLB on tripo3d.ai (their 200 credits are web-app credits; the Tripo API wallet was 0). Drop it at `assets/dove.glb` and rebuild, or drag-and-drop a GLB onto the running game. Loader normalizes to ~4 units and assumes the model faces +Z (rotates 180°) — check orientation when the real file arrives.
- ElevenLabs key tried: lacks `music_generation` and `sound_generation` permissions → audio stays procedural. Gemini key is free tier (image quota 0) → no Nano Banana textures; all textures are procedural canvas.
- Open: real GLB swap, per-landmark detail, possibly music from ElevenLabs once a key with permissions exists.
