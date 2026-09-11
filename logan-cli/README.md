<p align="center">
  <img src="docs/assets/banner.jpg" alt="LOGAN coding agent CLI by Yuval Avidani (YUV.AI)" width="100%"/>
</p>

# Logan

**A coding agent in your terminal.**  
Shows every token you spend. Skills and modes are **opt-in** - you compose the agent.

By [Yuval Avidani (YUV.AI)](https://yuv.ai) · inspired by Wolverine · fork of [xAI Grok Build](https://github.com/xai-org/grok-build) (Apache-2.0)

> **Default is empty and clean.**  
> Active skills start empty. Modes start off. No forced HyperFrames, no forced yuvai-thinking, no forced caveman.  
> You add what you want - and remove it anytime.

**Repo (prod):** [github.com/hoodini/logan-cli](https://github.com/hoodini/logan-cli)

---

## Install (one command)

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.ps1 | iex
```

That puts `logan` on your PATH, creates `~/.logan`, refreshes the **skill catalog** (library only), and starts the app.  
**It does not auto-enable skills or modes.**

**Windows prerequisites:** building Logan needs the MSVC linker + C runtime libs — install **Visual Studio Build Tools** with the **"Desktop development with C++"** workload (`winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive"`). Rust, git, and protoc are bootstrapped automatically. The installer scans every Visual Studio on the machine and picks the newest one with a **complete** C++ toolset — a VS install that ships the compiler without the desktop libs (e.g. onecore-only) is skipped instead of breaking the build. Running `install-logan.sh` from Git Bash also works: it hands off to the PowerShell installer.

<p align="center">
  <img src="docs/assets/infographic-one-command-install.jpg" alt="Logan one-command install" width="100%"/>
</p>

### Login

```bash
logan login                 # browser - xAI user account
logan login --from-grok     # reuse ~/.grok/auth.json if Grok Build is already signed in
# or: export XAI_API_KEY="your-key"
logan
```

**Which credential wins?** Per-model `api_key` / `env_key` always wins for that model.  
Session / Grok import is for default xAI models. See [docs/SETUP.md](docs/SETUP.md#auth-vs-which-llm-you-use).

---

## Update (keep Logan current)

### Inside the TUI (every time)

```text
/update              # GitHub main via install script (background rebuild)
/update status       # tail ~/.logan/logs/update.log
/update check        # check release channel only
/update release      # published releases (same idea as `logan update`)
/update help
```

When the log shows `finished exit=0`, **quit Logan and start again**:

```bash
logan --version
logan
```

### Outside the TUI

```bash
# Preferred: pull GitHub main + rebuild + install (no auto-start)
curl -fsSL https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.sh | LOGAN_INSTALL_NO_START=1 bash

# Same path via CLI once you have a current binary:
logan update
```

`logan update` uses the **Logan install script** (hoodini/logan-cli), not the x.ai Grok CDN.  
If an old binary still tries to download "Grok 0.2.x", run the curl install line once to replace it.

> After any update, restart Logan so the new binary is loaded.

---

## Install troubleshooting

**Windows: `LINK : fatal error LNK1104: cannot open file 'libcmt.lib'` (repeated for many crates)**  
A Visual Studio on your machine has the C++ *compiler* but not the desktop C runtime *libraries* — typically after installing/upgrading to a new VS whose C++ component only includes `onecore` libs. Rust auto-picks the newest VS, so every link fails. The installer now detects this and imports the environment of the newest **complete** MSVC toolset instead. If it reports that *no* complete toolset exists, open the Visual Studio Installer and add **"Desktop development with C++"** (or run the `winget` line from the Windows install section), then re-run the one-liner.

**Windows: `LINK : fatal error LNK1318: Unexpected PDB error; LIMIT (12)` on the final `logan.exe` link**  
The MSVC 14.44 linker (VS 2022 17.14) has a PDB-writer defect that can kill the final link of very large Rust binaries — Logan crossed the trigger threshold as the workspace grew. The installer now detects LNK1318 and automatically relinks with `/DEBUG:NONE` (no PDB; the exe is identical, you just lose local debug symbols). If you build manually, either link with a VS 2019 (14.29) toolset — which handles it fine — or run:  
`cargo rustc -p xai-grok-pager-bin --release --bin logan -- -Clink-arg=/DEBUG:NONE`  
The installer also builds with `CARGO_INCREMENTAL=0` (matching CI) to save disk and reduce PDB pressure.

**Windows: `Copy-Item: Cannot find path '…Your branch is up to date…\target\release\logan.exe'` on a re-run**  
Fixed — older installer versions leaked `git pull` output into the resolved repo path on second and later runs. Re-run the one-liner to get the fixed script.

**`logan --version` is old after an update**  
Fixed — older installer versions reinstalled a previously built (stale) binary after `git pull`. The installer now rebuilds whenever the binary is older than the checked-out commit. `LOGAN_FORCE_BUILD=1` forces a rebuild regardless.

**The install window closes / TUI doesn't start after install (Windows)**  
Fixed — the post-install launch used a `Start-Process` parameter that doesn't exist (`-UseShellExecute`), which threw at the very end of the install. Logan now starts in a new console window. Your install was still fine; only the auto-start failed.

**Errors on `bash scripts/install-logan.sh` from Git Bash on Windows**  
The bash installer now delegates to `install-logan.ps1` automatically — use either one-liner.

---

## First 5 minutes

| You type | What you get |
| --- | --- |
| `hi` | Chat (plain coding agent) |
| `/stats` | Tokens: input / output / cache / $ |
| `/context deep` | Real system prompt + messages |
| `/goal Fix the bug` | Long multi-step work |
| `/update` | Pull latest Logan from GitHub (then restart) |
| `/skills catalog` | Optional library (not installed yet) |
| `/skills list` | What **you** installed (starts empty) |
| `/skills add pack modes` | Opt-in: caveman, think, ponytail, whoami, self-improve |
| `/skills add pack creative` | Opt-in: HyperFrames, scrub landings, reels |
| `/skills remove <name>` | Drop a skill you no longer want |

Bottom bar after each reply:

```text
m grok-4.5 · 24K/200K 12% · in 2.4K out 180 c 1.2K
```

<p align="center">
  <img src="docs/assets/infographic-token-visibility.jpg" alt="Logan token visibility" width="100%"/>
</p>

---

## You compose the agent (empty by default)

| Path | Role |
| --- | --- |
| `~/.logan/skills/` | **Active** skills - starts **empty** |
| `~/.logan/catalog/skills/` | **Library** from install - available, not forced |
| `~/.logan/modes.toml` | Modes - all **off** until you enable them |

```text
/skills catalog
/skills add pack modes
/skills add pack creative
/skills add yuvai-thinking
/skills remove video-edit
```

Bare `/skills` opens the skills modal. With args, it manages the catalog.

### Thinking is not prebaked

| Step | Command |
| --- | --- |
| 1. Install skill | `/skills add yuvai-thinking` |
| 2. Turn mode on | `/think full` |
| 3. Turn off | `/think off` |
| 4. Uninstall | `/skills remove yuvai-thinking` |

Without that, Logan does **not** run the "every crumb" teach style.

### Creative pack (only after you opt in)

```text
/skills add pack creative      # aliases: video · scrub · design
```

| Intent | Command | Skill |
| --- | --- | --- |
| Design DNA for ANY web deliverable | automatic once installed | `yuv-design-dna` |
| Mouse-scrub landing | `/site mouse video.mp4` | `cinematic-scrub-landing` |
| Scroll-scrub parallax | `/site parallax video.mp4` | `parallax-landing-page` |
| Apple sticky scroll | `/site scroll video.mp4` | `video-to-landing-page` |
| Captioned reel | `/reel video.mp4` | `video-edit` |
| Stack map | `/creative` | shows installed vs catalog |

`yuv-design-dna` is the umbrella: signature scrub/parallax heroes by default,
HyperFrames catalog before hand-rolled motion, the YUV design system (palettes,
Anton/Inter + Rubik/Assistant, radii 0/999), and **blocking** gates for WCAG AA
accessibility, mobile-first at 390px, reduced-motion fallbacks, and an
anti-AI-look checklist - pages ship with a human touch, not a template smell.

If a skill is missing, Logan tells you how to add it - it does not invent the stack silently.

Full map: **[docs/CREATIVE.md](docs/CREATIVE.md)** · modes: **[docs/MODES.md](docs/MODES.md)** · catalog: **[skills/README.md](skills/README.md)**

Also: [hoodini/ai-agents-skills](https://github.com/hoodini/ai-agents-skills) · [HyperFrames](https://github.com/heygen-com/hyperframes)

### Modes (off until you enable)

| Mode | Command | Needs skill first |
| --- | --- | --- |
| Think | `/think off\|lite\|full\|ultra` | `yuvai-thinking` |
| Caveman | `/caveman off\|lite\|full\|ultra` | `caveman` |
| Ponytail | `/ponytail off\|lite\|full\|ultra` | `ponytail` |
| Status | `/modes` | - |

**`/think` and `/caveman` are exclusive** (deep explain vs terse talk).  
Enabling a mode without the skill installed fails with a clear `/skills add …` hint.

### Optional power-user install flags

```bash
LOGAN_SEED_SKILLS=1 …              # install entire catalog into active skills (not default)
LOGAN_SYNC_SIBLING_SKILLS=1 …      # also copy from ~/.claude / ~/.grok skills
```

---

## How Logan improves itself

Self-improvement is a closed loop of four parts - three are automatic, one is
the model's standing obligation:

| Stage | Mechanism | Automatic? |
| --- | --- | --- |
| **Evidence** | `retrospective.json` hook (seeded by the installer): every failed tool call, denied permission, and API error is recorded; at session end they are aggregated into a structured entry in `~/.logan/memory/IMPROVEMENTS.md` | yes |
| **Insight** | The `self-improve` skill obliges Logan to root-cause pending `(Logan:` retrospectives at session start, journal a lesson after every bug fix, and escalate failure classes seen twice into permanent guards | model-driven |
| **Consolidation** | autoDream (`[memory.dream]` in config.toml): a periodic background pass distills recent sessions and journals into curated `MEMORY.md` | yes |
| **Recall** | `[memory.initial_injection]`: curated memory (preferences + lessons) is injected into every new session | yes |

Inspect and steer it any time:

```text
/improve          # dashboard: reflections, lessons, open questions
/improve log      # tail reflections.log + IMPROVEMENTS.md
/heal             # failure-focused view
/flush            # force a rich session summary into memory
```

Files, if you want to read what it learned: `~/.logan/memory/IMPROVEMENTS.md`
(structured journal), `~/.logan/memory/reflections.log` (event firehose),
`~/.logan/memory/MEMORY.md` (curated long-term memory - Preferences + Lessons).

---

## Why Logan feels different

| Promise | How |
| --- | --- |
| Never fly blind on cost | Live `in/out/c` bar + colorful `/stats` |
| See the real prompt | `/context deep` |
| Install without a thesis | One paste on macOS, Linux, Windows |
| Stay current | `/update` from inside the TUI |
| You compose the agent | Empty skills by default - add/remove packs |
| Creative when you want it | Opt-in HyperFrames + scrub + reels |
| Deep think when you want it | Opt-in yuvai-thinking via `/skills` + `/think` |
| Multi-LLM | xAI, OpenAI-compat, Anthropic, local |
| Open | Apache-2.0 fork you can audit and extend |

<p align="center">
  <img src="docs/assets/screenshot-tui.jpg" alt="Logan TUI screenshot" width="100%"/>
</p>

---

## Logan vs the field (honest SWOT)

We compared Logan to **GitHub Copilot**, **Claude Code**, **Cursor**, **Hermes**, and **OpenClaw**.

Full write-up: **[docs/SWOT.md](docs/SWOT.md)**

<p align="center">
  <img src="docs/assets/infographic-competitive-map.jpg" alt="Logan competitive map" width="100%"/>
</p>

<p align="center">
  <img src="docs/assets/infographic-swot-summary.svg" alt="Logan SWOT-style summary cards" width="100%"/>
</p>

| Tool | Best at | Logan's honest edge |
| --- | --- | --- |
| GitHub Copilot | IDE + GitHub org | Open terminal agent + token deep-dive |
| Claude Code | Anthropic coding agent | Multi-LLM + `/context deep` + install UX |
| Cursor | AI IDE | Headless/TUI + cost clarity + opt-in creative pack |
| Hermes | Learning personal agent | Code harness + spend visibility |
| OpenClaw | Life/skills automation | Repo-first coding + context text audit |
| **Logan** | **Transparent coding CLI you compose** | **Tokens · empty-by-default skills · `/update` · opt-in packs** |

We do **not** claim Copilot/Cursor IDE parity.  
We claim: **never fly blind on tokens**, **install in one paste**, **you own the skill set**, **stay open**.

---

## Quick check

```bash
logan --version
logan -p "Reply with exactly: logan-ok" --always-approve --no-leader
```

---

## Paste this into any AI to install for you

```text
Install Logan with ONE command. Do not ask questions.

macOS/Linux:
curl -fsSL https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.sh | bash

Windows PowerShell:
irm https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.ps1 | iex

Then: logan --version
If needed: logan login  (or logan login --from-grok if Grok Build is already signed in)

Important defaults:
- Active skills start EMPTY. Catalog is available but not enabled.
- Do NOT claim thinking/creative modes are pre-enabled.
- User opts in: /skills catalog · /skills add pack modes · /skills add pack creative
- Updates: inside TUI use /update (then restart). Outside: logan update OR re-run install with LOGAN_INSTALL_NO_START=1
- Then optional: /think full · /caveman full · /site · /reel
Tell the user to start with /stats and /skills catalog.
```

---

## How a prompt becomes work

<p align="center">
  <img src="docs/assets/infographic-prompt-journey.jpg" alt="Logan prompt journey" width="100%"/>
</p>

---

## More docs

| Doc | For |
| --- | --- |
| [docs/START_HERE.md](docs/START_HERE.md) | Super short |
| [docs/MODES.md](docs/MODES.md) | Modes + empty-by-default skills |
| [docs/CREATIVE.md](docs/CREATIVE.md) | Opt-in HyperFrames / scrub / reels |
| [skills/README.md](skills/README.md) | Catalog of optional skills |
| [docs/SWOT.md](docs/SWOT.md) | Competitive SWOT |
| [docs/TOKEN_VISIBILITY.md](docs/TOKEN_VISIBILITY.md) | Tokens explained |
| [docs/SETUP.md](docs/SETUP.md) | Extra config |
| [docs/FEATURES.md](docs/FEATURES.md) | Full list |
| [examples/showcase/](examples/showcase/) | Golden creative paths (after opt-in) |

---

**Yuval Avidani** · [yuv.ai](https://yuv.ai) · [@yuvalav](https://x.com/yuvalav) · [@hoodini](https://github.com/hoodini)

```text
claws out.
```
