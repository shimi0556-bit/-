# -

A personal playground repo: vendored tools/apps and Claude Code skills, collected while exploring what's out there to extend Claude Code with.

## Projects

| Folder | What it is | How to run |
|---|---|---|
| [`claude-demo-video/`](claude-demo-video) | Remotion video project | `cd claude-demo-video && npm install && npm run dev` (opens Remotion Studio) |
| [`3d-model-extractor/`](3d-model-extractor) | Chrome extension — detects and downloads 3D model files (GLB, GLTF, FBX, OBJ, STL, USDZ, …) from any site via network interception, with an in-browser GLB→STL/3MF converter. Source: [hoodini/3d-extracter](https://github.com/hoodini/3d-extracter) | `chrome://extensions` → Developer mode → Load unpacked → select this folder |
| [`virtual-typewriter/`](virtual-typewriter) | Next.js app simulating a 1960s mechanical typewriter — animated keys, sound design, ink/paper simulation, typebar jam mechanic. Source: hoodini/virtual-typewriter | `cd virtual-typewriter && bun install && bun run dev` |
| [`skyhawk-flight-simulator/`](skyhawk-flight-simulator) | Three.js 3D helicopter flight simulator (San Francisco → London). Source: [hoodini/SkyHawk-Flight-Simulator](https://github.com/hoodini/SkyHawk-Flight-Simulator) | Open `index.html` directly, or serve statically |
| [`effects-yuv-ai/`](effects-yuv-ai) | Self-contained GSAP + Three.js visual effects catalog for HyperFrames compositions. Source: [hoodini/effects-yuv-ai](https://github.com/hoodini/effects-yuv-ai) | Open `index.html` directly |
| [`blitzai/`](blitzai) | Hebrew-first transcription studio (FastAPI backend + Next.js frontend) — 4 engines (local faster-whisper, Groq, Gemini, HuggingFace ivrit-ai), YouTube/URL ingestion via yt-dlp, correction studio. Source: [hoodini/blitzai](https://github.com/hoodini/blitzai) | `./start.sh` (see `SETUP_GUIDE.md`) |
| [`roboshaul-hebrew-tts/`](roboshaul-hebrew-tts) | Google Colab notebook — Hebrew text-to-speech (Tacotron 2, trained on SASPEECH). Needs a GPU runtime, doesn't run locally. Source: [hoodini/roboshaul-adjusted](https://github.com/hoodini/roboshaul-adjusted) | Open the `.ipynb` in [Google Colab](https://colab.research.google.com), set runtime to GPU |
| [`nano-banana-ui/`](nano-banana-ui) | Next.js web UI for Google Gemini image generation (Nano Banana Pro). Source: [hoodini/nano-banana-ui](https://github.com/hoodini/nano-banana-ui) | `cd nano-banana-ui && npm install && npm run dev` |
| [`tokana/`](tokana) | Local Claude Code token-usage analyzer + statusline — reads Claude Code's own usage receipts, no API key needed. Source: [hoodini/tokana](https://github.com/hoodini/tokana) | `cd tokana && bun install && bun run dev` (indexes usage, then serves the dashboard) |
| [`logan-cli/`](logan-cli) | Terminal coding agent (Rust) built on xAI's Grok models — a fork of xAI's open-source Grok Build. **Alternative to Claude Code**, needs its own `XAI_API_KEY`. Source: [hoodini/logan-cli](https://github.com/hoodini/logan-cli) | `cd logan-cli && cargo build --release` |
| [`tuning-numbers/`](tuning-numbers) | Interactive, scroll-driven lesson on how neural networks train and how it scales to an LLM — all math runs live in-browser, gradient-checked. Source: [hoodini/tuning-numbers](https://github.com/hoodini/tuning-numbers) | `cd tuning-numbers/site && npm install && npm run dev` |
| [`claude-hud/`](claude-hud) | Claude Code plugin — real-time statusline HUD showing context usage, active tools, running agents, and todo progress, zero config. Source: [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) | `npm install` inside the folder, then follow the plugin's `README.md` (or install as a Claude Code plugin via its marketplace manifest) |
| [`gods-eye-view/`](gods-eye-view) | "A spy satellite simulator in your browser, except the data is real" — a photorealistic 3D globe (Cesium/Google 3D Tiles) with live flight tracking, AIS vessels, public CCTV feeds, weather, and voice control. Most layers work keyless with fallbacks; live data layers need free API keys (see `.env.example`). Source: [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) | `npm install && npm run dev` |
| [`claude-spark-pack/`](claude-spark-pack) | Self-contained cinematic "Claude Spark Engine" HTML page (Hebrew RTL, dark neon) plus the nested `cinematic-spark` skill. Pairs with `cinematic-spark` in `.claude/skills`. | Open `spark.html` directly |
| [`claude-grok-mcp-bridge/`](claude-grok-mcp-bridge) | Python MCP server — shared mailbox and task board between Claude and Grok Bot (Streamable HTTP + OAuth, or local stdio). Needs a local `BRIDGE_TOKEN` (see `.env.example`; no secrets committed). | `cd claude-grok-mcp-bridge && cp .env.example .env && uv sync --group dev && uv run claude-grok-mcp-bridge http` |
| [`vscode-course/`](vscode-course) | Self-contained interactive Hebrew (RTL) course on Visual Studio Code — 3 levels (beginner → intermediate → advanced), 22 lessons with quizzes, a printable shortcuts cheat sheet, a final exam, and a certificate. Single HTML file, no build, no network. | Open `index.html` directly |

Most of these were vendored (copied in, not submoduled) from [hoodini](https://github.com/hoodini) (Yuval Avidani)'s public GitHub repos; `claude-hud` and `gods-eye-view` are from different, independent authors (jarrodwatts, 27.9k★; bilawalsidhu, 25.6k★). `claude-spark-pack/`, `claude-grok-mcp-bridge/`, and `claude-skills/` are local packs added to this playground (not from those GitHub sources).

**Not vendored:** [poloclub/transformer-explainer](https://github.com/poloclub/transformer-explainer) — a well-known interactive visualization of how a GPT-2 transformer works, live at [poloclub.github.io/transformer-explainer](https://poloclub.github.io/transformer-explainer). Skipped because it bundles ~627MB of real GPT-2 ONNX model weights (~1.2GB total repo) — too heavy to vendor into git. Just visit the live demo.

## Claude Code skills

Installed via the [`skills`](https://www.npmjs.com/package/skills) CLI and tracked in `skills-lock.json`. Symlinked into `.claude/skills` (and other agent dirs under `.agents/skills`).

**From [remotion-dev/skills](https://github.com/remotion-dev/skills):**
`remotion-best-practices`, `remotion-create`, `remotion-captions`, `remotion-docs`, `remotion-interactivity`, `remotion-maps`, `remotion-markup`, `remotion-multimedia`, `remotion-render`, `remotion-saas`, `remotion-studio`, `remotion-upgrade`

**From [hoodini/ai-agents-skills](https://github.com/hoodini/ai-agents-skills):**
`video-edit`, `video-to-landing-page`, `parallax-landing-page`, `cinematic-scrub-landing`, `image-master`, `nano-banana-pro`, `fal-ai`, `mermaid-diagrams`, `analytics-metrics`, `ux-design-systems`, `owasp-security`, `web-accessibility`, `mobile-responsiveness`, `shabbat-times`

**From [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills)** (build/upgrade/finish Three.js browser games — pairs well with `skyhawk-flight-simulator/`):
`threejs-game-director` (entrypoint/router), `threejs-gameplay-systems`, `threejs-aaa-graphics-builder`, `threejs-game-ui-designer`, `threejs-3d-generator`, `threejs-image-generator`, `threejs-audio-generator`, `threejs-debug-profiler`, `threejs-qa-release`

**Local / this repo** (canonical copies in [`claude-skills/`](claude-skills), installed into `.agents/skills` and symlinked into `.claude/skills`):
`cinematic-spark` (pairs with `claude-spark-pack/`), `claude-grok-bridge` (pairs with `claude-grok-mcp-bridge/`)

To add more skills: `npx skills add <owner>/<repo> -s <skill-name> -y`

## Notes

- Everything here was checked for hardcoded secrets and suspicious code (`eval`, unexpected network calls, unknown binaries) before being vendored — see each project's PR description in the repo history for specifics.
- `logan-cli` is a competing coding-agent CLI (xAI/Grok-based), not a tool that complements Claude Code — kept here for reference/curiosity, not as part of the toolchain.
