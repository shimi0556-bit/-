# Benchmark: Grok Build vs Logan

**Author:** Yuval Avidani (YUV.AI)  
**Last run:** 2026-07-17 (re-verified on this machine after install)

Simple question: **what does Logan add that Grok Build does not?**

Run the check yourself:

```bash
bash scripts/feature-check.sh
```

---

## Machines under test

| App | Version | Binary |
| --- | --- | --- |
| **Logan** | `logan 0.1.220-alpha.4 (afa121d)` | `~/.local/bin/logan` (~151 MB) |
| **Grok Build** | `grok 0.2.101 (stable)` | `~/.local/bin/grok` → official install |

Different codebases - fair feature comparison, not a micro-CPU race.

---

## Feature checklist (binary + smoke)

| Check | Grok Build | Logan | Notes |
| --- | --- | --- | --- |
| Runs headless one-shot | **Pass** (`grok-ok` ~4.1s) | **Pass** (`logan-ok` ~4.1s) | Same order of latency |
| `/goal` present | Pass | Pass | Inherited harness |
| `/stats` string present | Pass | Pass | Name exists upstream |
| **Colorful Token stats UI** | **Miss** | **Pass** | Logan `TokenStatsBlock` |
| **`/context deep`** | **Miss** | **Pass** | Real system prompt + messages |
| **Deep dive text render** | **Miss** | **Pass** | Session file previews |
| Live last-turn `in/out/c` bar | Partial / basic | **Pass** | Wired every sample |
| Dual-stack chips `m · s · mcp` | No | **Pass** | Status bar |
| Compact before → after banner | Basic | **Pass** (saved N) | Clearer copy |
| Brand / author credit | xAI | **Yuval / YUV.AI** | Pass |
| One-script install | No | **`install-logan.sh`** | Pass |
| Auto skills from Claude/Cursor/Grok homes | Limited | **Pass** | Synced + discovered |
| `system_prompt.txt` after turns | Yes | Yes | Deep dive input |
| Smart `--route auto` | No (this build) | **Pass** | CLI flag |

### String scan summary (this run)

```text
Logan:  /stats OK · Token stats OK · context deep OK · Deep dive OK · /goal OK · Yuval OK
Grok:   /stats OK · Token stats MISS · context deep MISS · Deep dive MISS · /goal OK · Yuval MISS
```

---

## Headless latency (same style prompt)

| CLI | Prompt | Result | Wall time |
| --- | --- | --- | --- |
| logan | `Reply with exactly: logan-ok` | `logan-ok` | **~5.0 s** |
| grok | `Reply with exactly: grok-ok` | `grok-ok` | **~3.9 s** |

**Takeaway:** same speed class for a tiny chat. Logan’s win is **visibility and product features**, not raw tokens/second.

---

## What you should feel as a user

| Need | Grok Build | Logan |
| --- | --- | --- |
| “How much did that cost in tokens?” | Dig around | **`/stats` in color** |
| “What text is eating my window?” | Open session files by hand | **`/context deep`** |
| “Am I near compact?” | Possible | **Bar % + `!` + banner** |
| “Install without reading 50 pages” | Harder | **3 steps in README** |

---

## How we tested (repeatable)

1. `bash scripts/install-logan.sh` (Logan up to date)  
2. `bash scripts/feature-check.sh`  
3. Headless one-shots for both CLIs when `grok` is installed  
4. `strings` scan for product UX markers  

Not a synthetic FLOPS benchmark. It is a **product feature + smoke** benchmark so anyone can re-run it.

---

## Scorecard (honest)

| Category | Winner |
| --- | --- |
| Upstream coding harness (tools, sandbox, sessions) | **Tie** (Logan is a fork) |
| Token / cost visibility | **Logan** |
| Real context text deep-dive | **Logan** |
| Install simplicity | **Logan** |
| Official auto-update channel | **Grok Build** (xAI stable) |
| Headless micro-latency | **Tie** (~same) |

Logan is for people who want **Grok Build power + clear spend visibility**.  
Grok Build is the official xAI product binary.

---

## Related

- Simple install: [../README.md](../README.md)  
- Tokens for humans: [TOKEN_VISIBILITY.md](TOKEN_VISIBILITY.md)  
- Long comparison: [COMPARISON.md](COMPARISON.md)  
