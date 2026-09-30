# Free Tools & Resources

Everything recommended here is free (open-source, or a generous permanent free tier — not a time-limited trial). Where a well-known tool in a category is paid instead, it's noted explicitly so it isn't recommended by mistake.

## Frameworks (2D browser games)

All of these are free and open source (MIT or similar) — pick based on project size, not budget:

- **Plain Canvas 2D + vanilla JS/TS** — no dependency at all. Best default for a small prototype or jam-scale game; see [Architecture & Game Loop](architecture-and-game-loop.md). Zero cost, zero install, easiest to hand off as a single HTML file.
- **[Phaser](https://phaser.io/)** — the most mature, most widely used free 2D framework (Canvas + WebGL). Best choice once a game grows past a handful of entities/scenes: built-in physics (Arcade/Matter), asset loader, tilemap support, animation system. Large ecosystem and docs, so gaps are easy to fill by reading its docs rather than reinventing.
- **[Kaboom/Kaplay](https://kaplayjs.com/)** — free, minimal-boilerplate 2D library. Fastest to get *something* on screen and playable; trades some performance and structure for speed of iteration. Good fit for a rapid prototype or a game-jam style build.
- **[PixiJS](https://pixijs.com/)** — free, lightweight 2D WebGL renderer with no built-in game framework opinions (no physics/scenes out of the box). Use when you want rendering performance and control but are building your own architecture (per [Architecture & Game Loop](architecture-and-game-loop.md)) rather than adopting a framework's structure.
- **[Excalibur.js](https://excaliburjs.com/)** — free, TypeScript-first 2D engine; a middle ground between Phaser's batteries-included approach and PixiJS's bare renderer.
- **[Babylon.js](https://www.babylonjs.com/)** — free, if the task genuinely calls for 3D in the browser (WebGL/WebGPU). Don't reach for this for a 2D game.

## Free/open-source desktop engines (when the user wants a real installable game, not just a browser one)

- **[Godot](https://godotengine.org/)** — fully free and open source (MIT), no royalties, no revenue cap. The best default recommendation over Unity/Unreal when the user wants a real desktop/console-capable engine and there's no reason to prefer a specific proprietary one — but note it needs to run locally (see MCP section below) and isn't something this environment can install/run/verify directly.
- Unity and Unreal both have free tiers but are not fully open-source and carry usage/revenue conditions — mention Godot first unless the user has a specific reason to want Unity or Unreal (an existing project, a specific feature, team familiarity).

## Free art & asset resources

Useful when a game needs placeholder or final 2D art/audio without commissioning custom work:

- **[Kenney.nl](https://kenney.nl/)** — large library of free, CC0 (public-domain-equivalent) game asset packs: sprites, UI, tilesets, sound. CC0 means no attribution is even required, though crediting is appreciated. Excellent default for prototypes and jams.
- **[OpenGameArt.org](https://opengameart.org/)** — community library of free game art and audio under various open licenses (CC0, CC-BY, GPL) — check each asset's specific license before using it, since not everything there is CC0.
- **[itch.io free asset packs](https://itch.io/game-assets/free)** — large marketplace with a dedicated free filter; quality and licensing vary per asset, so check the listed license on each.
- **[Freesound.org](https://freesound.org/)** — free sound effect library (Creative Commons licenses; some require attribution — check per-sound).
- **[Google Fonts](https://fonts.google.com/)** — free, open-license fonts for any in-game UI text.

## Free/open-source pixel art tools

- **[LibreSprite](https://libresprite.github.io/)** — free, open-source fork of an older Aseprite codebase. Lacks some of modern Aseprite's newer features but is fully capable for pixel art and sprite-sheet work at no cost.
- **[Piskel](https://www.piskelapp.com/)** — free, browser-based pixel art / sprite animation editor, no install needed.
- Note: **Aseprite itself is paid** (a small one-time purchase) — don't recommend it as a free default; use LibreSprite or Piskel instead unless the user already owns Aseprite.

## Free level/map tools

- **[Tiled](https://www.mapeditor.org/)** — free, open-source tile map editor; exports formats that Phaser, Godot, and most other free engines/frameworks can import directly. The standard free choice for 2D level layout.

## MCP servers / editor integrations (mostly relevant to a local machine, not this sandboxed session)

These connect an AI agent directly to a running game editor. They require the actual editor installed and running locally, so they're not usable inside this remote session — worth knowing about for when the user is working on their own machine with Claude Code:

- **Godot MCP** (e.g. the open-source GDAI/godot-ai project) — free, connects Claude to a locally running Godot editor: create scenes, write GDScript, read editor errors.
- **Blender MCP** — free/open-source options exist for connecting Claude to a locally running Blender, useful paired with Godot MCP for a full free asset-to-engine pipeline.
- Unity/Unreal MCP integrations also exist, but Unity/Unreal themselves are not fully free/open-source (see above) — prefer the Godot + Blender free pairing unless the user is already committed to Unity/Unreal.

## AI asset-generation tools that are NOT free (avoid recommending by default)

Worth knowing these exist, but they are paid products (subscription or credit-based), so don't suggest them as the default path when a free option covers the need:

- **Meshy**, **Tripo** — paid text/image-to-3D-asset generation.
- **Scenario** — paid style-consistent 2D asset generation.
- **Ludo.ai** — paid, combines market research with asset generation.
- AI voice/SFX generation services (e.g. ElevenLabs) typically have a limited free tier, not unlimited free use — fine for a one-off sound, but don't assume it scales to a project's full audio needs for free; prefer [Freesound.org](https://freesound.org/) or the Web Audio API techniques in [Audio & Feedback](audio-and-feedback.md) as the free-by-default path.
