# Wiki

A persistent, Claude-maintained knowledge base for this repo, following the pattern described in [karpathy's "LLM wiki" gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): instead of re-discovering context from scratch every session, Claude reads and updates these pages as it works.

## Layers

- **Raw sources** — the actual project folders, `README.md`, `skills-lock.json`, git history. Read, never edited by the wiki process itself.
- **This wiki** (`wiki/*.md`) — one page per project/subsystem. Claude actively writes and updates these.
- **Schema** — `CLAUDE.md` at the repo root defines when/how Claude reads and updates wiki pages.

## Operations

- **Ingest** — after doing meaningful work on a project (a fix, a decision, a dead end), update that project's wiki page: what changed, why, what's still open.
- **Query** — before starting work on a project, read its wiki page first instead of re-scanning the whole folder.
- **Lint** — periodically check pages for contradictions, staleness (info that no longer matches the code), or orphaned pages (project folder deleted but page remains, or vice versa).

## Pages

| Page | Project |
|---|---|
| [`3d-model-extractor.md`](3d-model-extractor.md) | [`3d-model-extractor/`](../3d-model-extractor) |
| [`agent.md`](agent.md) | [`agent/`](../agent) |
| [`blitzai.md`](blitzai.md) | [`blitzai/`](../blitzai) |
| [`claude-demo-video.md`](claude-demo-video.md) | [`claude-demo-video/`](../claude-demo-video) |
| [`claude-grok-mcp-bridge.md`](claude-grok-mcp-bridge.md) | [`claude-grok-mcp-bridge/`](../claude-grok-mcp-bridge) |
| [`claude-hud.md`](claude-hud.md) | [`claude-hud/`](../claude-hud) |
| [`claude-skills.md`](claude-skills.md) | [`claude-skills/`](../claude-skills) |
| [`claude-spark-pack.md`](claude-spark-pack.md) | [`claude-spark-pack/`](../claude-spark-pack) |
| [`effects-yuv-ai.md`](effects-yuv-ai.md) | [`effects-yuv-ai/`](../effects-yuv-ai) |
| [`gods-eye-view.md`](gods-eye-view.md) | [`gods-eye-view/`](../gods-eye-view) |
| [`logan-cli.md`](logan-cli.md) | [`logan-cli/`](../logan-cli) |
| [`nano-banana-ui.md`](nano-banana-ui.md) | [`nano-banana-ui/`](../nano-banana-ui) |
| [`roboshaul-hebrew-tts.md`](roboshaul-hebrew-tts.md) | [`roboshaul-hebrew-tts/`](../roboshaul-hebrew-tts) |
| [`skyhawk-flight-simulator.md`](skyhawk-flight-simulator.md) | [`skyhawk-flight-simulator/`](../skyhawk-flight-simulator) |
| [`tokana.md`](tokana.md) | [`tokana/`](../tokana) |
| [`tuning-numbers.md`](tuning-numbers.md) | [`tuning-numbers/`](../tuning-numbers) |
| [`virtual-typewriter.md`](virtual-typewriter.md) | [`virtual-typewriter/`](../virtual-typewriter) |

New project folder added to the repo → add a page here and a row in this table.
