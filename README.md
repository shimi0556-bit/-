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

Most of these were vendored (copied in, not submoduled) from [hoodini](https://github.com/hoodini) (Yuval Avidani)'s public GitHub repos.

## Claude Code skills

Installed via the [`skills`](https://www.npmjs.com/package/skills) CLI and tracked in `skills-lock.json`. Symlinked into `.claude/skills` (and other agent dirs under `.agents/skills`).

**From [remotion-dev/skills](https://github.com/remotion-dev/skills):**
`remotion-best-practices`, `remotion-create`, `remotion-captions`, `remotion-docs`, `remotion-interactivity`, `remotion-maps`, `remotion-markup`, `remotion-multimedia`, `remotion-render`, `remotion-saas`, `remotion-studio`, `remotion-upgrade`

**From [hoodini/ai-agents-skills](https://github.com/hoodini/ai-agents-skills):**
`video-edit`, `video-to-landing-page`, `parallax-landing-page`, `cinematic-scrub-landing`, `image-master`, `nano-banana-pro`, `fal-ai`, `mermaid-diagrams`, `analytics-metrics`, `ux-design-systems`, `owasp-security`, `web-accessibility`, `mobile-responsiveness`, `shabbat-times`

To add more skills: `npx skills add <owner>/<repo> -s <skill-name> -y`

## Notes

- Everything here was checked for hardcoded secrets and suspicious code (`eval`, unexpected network calls, unknown binaries) before being vendored — see each project's PR description in the repo history for specifics.
- `logan-cli` is a competing coding-agent CLI (xAI/Grok-based), not a tool that complements Claude Code — kept here for reference/curiosity, not as part of the toolchain.
