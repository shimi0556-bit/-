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

Most of these were vendored (copied in, not submoduled) from [hoodini](https://github.com/hoodini) (Yuval Avidani)'s public GitHub repos; `claude-hud` and `gods-eye-view` are from different, independent authors (jarrodwatts, 27.9k★; bilawalsidhu, 25.6k★).

**Not vendored:** [poloclub/transformer-explainer](https://github.com/poloclub/transformer-explainer) — a well-known interactive visualization of how a GPT-2 transformer works, live at [poloclub.github.io/transformer-explainer](https://poloclub.github.io/transformer-explainer). Skipped because it bundles ~627MB of real GPT-2 ONNX model weights (~1.2GB total repo) — too heavy to vendor into git. Just visit the live demo.

## Claude Code skills

Installed via the [`skills`](https://www.npmjs.com/package/skills) CLI and tracked in `skills-lock.json`. Symlinked into `.claude/skills` (and other agent dirs under `.agents/skills`).

**From [remotion-dev/skills](https://github.com/remotion-dev/skills):**
`remotion-best-practices`, `remotion-create`, `remotion-captions`, `remotion-docs`, `remotion-interactivity`, `remotion-maps`, `remotion-markup`, `remotion-multimedia`, `remotion-render`, `remotion-saas`, `remotion-studio`, `remotion-upgrade`

**From [hoodini/ai-agents-skills](https://github.com/hoodini/ai-agents-skills):**
`video-edit`, `video-to-landing-page`, `parallax-landing-page`, `cinematic-scrub-landing`, `image-master`, `nano-banana-pro`, `fal-ai`, `mermaid-diagrams`, `analytics-metrics`, `ux-design-systems`, `owasp-security`, `web-accessibility`, `mobile-responsiveness`, `shabbat-times`, `director`, `figma`, `yuv-decks`, `yuv-design-system`, `yuv-viral-video`

`yuv-viral-video`'s upstream `SKILL.md` frontmatter has an unquoted `description:` containing a bare `: ` (invalid YAML — nested mapping), which makes `skills add` skip it; it was vendored manually with the description string quoted so it parses.

**From [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills)** (build/upgrade/finish Three.js browser games — pairs well with `skyhawk-flight-simulator/`):
`threejs-game-director` (entrypoint/router), `threejs-gameplay-systems`, `threejs-aaa-graphics-builder`, `threejs-game-ui-designer`, `threejs-3d-generator`, `threejs-image-generator`, `threejs-audio-generator`, `threejs-debug-profiler`, `threejs-qa-release`

**From [obra/superpowers-skills](https://github.com/obra/superpowers-skills)** (the skills behind the 200k+-star Superpowers agentic-development framework — TDD, debugging, planning, and creative problem-solving):
`test-driven-development-tdd`, `systematic-debugging`, `root-cause-tracing`, `defense-in-depth-validation`, `verification-before-completion`, `condition-based-waiting`, `testing-anti-patterns`, `testing-skills-with-subagents`, `brainstorming-ideas-into-designs`, `writing-plans`, `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `requesting-code-review`, `code-review-reception`, `using-git-worktrees`, `finishing-a-development-branch`, `preserving-productive-tensions`, `remembering-conversations`, `collision-zone-thinking`, `inversion-exercise`, `meta-pattern-recognition`, `scale-game`, `simplification-cascades`, `tracing-knowledge-lineages`, `when-stuck-problem-solving-dispatch`, `writing-skills`, `sharing-skills`, `gardening-skills-wiki`, `pulling-updates-from-skills-repository`, `getting-started-with-skills`

**From [danielrosehill/Claude-Israel-Agent-Skills-Plugin](https://github.com/danielrosehill/Claude-Israel-Agent-Skills-Plugin)** (Israel/Hebrew-specific: government, healthcare, emergency preparedness, finance, news):
`israel-post-appointment`, `kol-zchut-lookup`, `miklatim-lookup`, `home-front-command-guidelines`, `nsc-travel-threat`, `israel-news-rss`, `ben-gurion-flight-board`, `salary-conversion`, `fiber-availability-check`, `israel-conferences`, `israel-drugs-registry-lookup`, `drug-co-il-lookup`, `medicine-availability-check`, `maccabi-medicine-lookup`, `list-skills`, `discover-israel-skills`, `install-companion-plugins`, `update-plugin-readme`

`maccabi-medicine-lookup` hit the same upstream YAML bug as `yuv-viral-video` above (unquoted `description:` with a bare `: `) and was vendored manually the same way. Four other skills in this plugin (`add-skill-to-plugin`, `environment-check`, `jerusalem-council-meetings`, `jerusalem-municipality-report`) have the identical bug and were left unvendored — narrow/meta-tooling skills, not worth the manual fix unless needed.

**From [anthropics/skills](https://github.com/anthropics/skills)** (Anthropic's own official examples — most others in this collection, like `pdf`/`docx`/`pptx`/`xlsx`/`mcp-builder`/`canvas-design`, are already active as Claude Code's built-in skills, so only the ones not built in were added):
`webapp-testing` (Playwright toolkit for testing the web apps vendored in this repo), `frontend-design` (distinctive UI direction, avoids generic "AI slop" defaults), `discernment-nudge` (appends fact/assumption-checking follow-up questions after a substantive answer), `internal-comms` (templates for status reports, incident reports, leadership updates)

**From [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills)** (comic creation):
`baoyu-comic` — knowledge/educational comic creator: 6 art styles × 7 tones × 7 panel layouts plus 5 presets (incl. Logicomix-style), builds a storyboard with consistent characters across panels, renders a final PDF. `baoyu-image-gen` — the image-rendering backend it uses (OpenAI GPT Image, Azure, Google, DashScope, Z.AI, MiniMax, Replicate, and more); **needs an API key for one of those providers to actually render panels** — it only builds prompts/storyboard without one. The rest of that repo (WeChat/Weibo/X posting, reverse-engineered "danger-*" skills, etc.) was left out as out of scope / not vetted.

**From [thinkbigleaders/claude-innovation-skills](https://github.com/thinkbigleaders/claude-innovation-skills)** (systematic-innovation pipeline — going from a raw idea to a validated invention):
`customer-discovery`, `blue-ocean-discovery` (phase 1 — understand the customer / find uncontested market space) → `solution-definition` (phase 2 — Amazon Working-Backwards + SIT Closed World) → `ideation-scamper` (+ its 7 sub-skills `scamper-substitute`/`combine`/`adapt`/`modify`/`eliminate`/`put-to-other-uses`/`reverse`), `ideation-sit`, `variable-dependency` (phase 3 — generate 30-50+ ideas) → `idea-evaluation`, `critical-validation` (phase 4 — rank and Six-Thinking-Hats-validate the top 3-5)

**From [smixs/creative-director-skill](https://github.com/smixs/creative-director-skill)**:
`creative-director` — generates and recursively refines creative concepts (SIT, TRIZ, Lateral Thinking, bisociation) scored against a 569-campaign library for originality; aimed at ad/campaign concepts more than physical-product invention, but the same ideation methodologies apply.

**From [tjboudreaux/cc-thinking-skills](https://github.com/tjboudreaux/cc-thinking-skills)** (28 structured-reasoning / mental-model skills — for solving any complex mystery: investigation, debugging, plot puzzles, decisions):
`thinking-model-router` (meta-skill: picks the right one below), `thinking-scientific-method` (rank falsifiable hypotheses, run the cheapest discriminating test first), `thinking-kepner-tregoe` (IS/IS-NOT difference analysis), `thinking-probabilistic` (Bayesian prior→likelihood→posterior updates on evidence), `thinking-map-territory` (verify against observed reality, don't theorize), `thinking-five-whys-plus`, `thinking-ooda`, `thinking-red-team`, `thinking-systems`, `thinking-socratic`, `thinking-steel-manning`, `thinking-pre-mortem`, `thinking-second-order`, `thinking-first-principles`, `thinking-triz`, and 13 more (`thinking-bounded-rationality`, `thinking-circle-of-competence`, `thinking-cynefin`, `thinking-effectuation`, `thinking-jobs-to-be-done`, `thinking-lindy-effect`, `thinking-margin-of-safety`, `thinking-model-combination`, `thinking-opportunity-cost`, `thinking-reversibility`, `thinking-theory-of-constraints`, `thinking-thought-experiment`, `thinking-via-negativa`).

Deliberately left out of scope: real-person OSINT/dossier tools and real-criminal-investigation guides found during the same search — a general evidence-based reasoning toolkit fits this repo, tools for surveilling real people or documentation meant for actual law-enforcement casework don't.

To add more skills: `npx skills add <owner>/<repo> -s <skill-name> -y`

## Notes

- Everything here was checked for hardcoded secrets and suspicious code (`eval`, unexpected network calls, unknown binaries) before being vendored — see each project's PR description in the repo history for specifics.
- `logan-cli` is a competing coding-agent CLI (xAI/Grok-based), not a tool that complements Claude Code — kept here for reference/curiosity, not as part of the toolchain.
