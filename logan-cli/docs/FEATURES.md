# Logan features: what you already have vs what we are adding

**Author:** Yuval Avidani (YUV.AI) · https://yuv.ai

This is the honest map for builders who want a **real** coding-agent CLI:
token visibility, auto-routing, goals, observability, and remote-agent use.

---

## Already in the harness (use today)

| Need | Logan / Grok Build today | How |
| --- | --- | --- |
| **Autonomous goals** | **Yes - `/goal`** | `/goal Migrate auth` · `/goal status` · pause/resume/clear. Enable if hidden: `GROK_GOAL=1` or remote/local goal flags. Planner + strategist + `update_goal` tool exist. |
| **Context token breakdown** | **Yes - `/context`** | System prompt / messages / reasoning / free + tool defs, skills, MCP cost estimates |
| **Session stats** | **Yes - `/session-info`** | Model, turns, context usage |
| **Billing/credits UI** | **Yes - `/usage`** | Product credit/billing path (provider-specific) |
| **Usage on API responses** | **Yes (wire)** | Sampler records `prompt_tokens`, `completion_tokens`, `reasoning_tokens`, `cached_prompt_tokens` / Anthropic `cache_read_input_tokens` |
| **Telemetry metrics** | **Yes** | `input` / `output` / `reasoning` / `cache_read` token counters + OTEL export path |
| **Headless “agent calls CLI”** | **Yes - not impossible** | `logan -p "…" --output-format json` · streaming-json · `agent stdio` (ACP) |
| **Multi-provider LLMs** | **Yes** | `[model.*]` + `examples/config/providers.toml` |
| **LiteLLM** | **Yes as OpenAI-compat** | Point `base_url` at LiteLLM proxy |
| **Langfuse-class tracing** | **Partial** | OTEL exporter exists; wire OTLP endpoint to Langfuse/OTEL backends |
| **Memory / self-improve** | **Yes (Logan)** | Memory + dream + skills + auto-reflect hooks |
| **Smart auto model routing** | **`--route auto` shipped** | Heuristic classifier → `tier-*` before sample; skill still available |
| **`/stats`** | **Shipped** | **Colorful** session ledger: IN/OUT/CACHE/REASON/$ by model (bold, high contrast) |
| **`/update`** | **Shipped** | Background update from GitHub main or release channel · `/update check|status` |
| **Opt-in skills** | **Shipped** | Empty `~/.logan/skills/` by default · `/skills add|remove|catalog` |
| **`/caveman` · `/ponytail` · `/think`** | **Shipped** | Modes off by default · require installed skill |
| **`/modes` · `/creative`** | **Shipped** | Status + creative map (shows installed vs catalog) |
| **`/site` · `/reel`** | **Shipped** | Need creative skills installed first |
| **`/whoami` · `/improve`** | **Shipped** | Optional identity + heal journal |
| **Catalog skills** | **Shipped** | In repo + `~/.logan/catalog/skills` - not auto-active |
| **`/context deep`** | **Shipped** | **Actual** system prompt + chat history text for those tokens (not only counts) |
| **Live status bar last-turn** | **Shipped** | Every sample: `in / out / c` from `PromptResponse._meta`; mid-tool window fill too |
| **Dual-stack status chips** | **Shipped** | `m <model> · s <search> · mcp N` on status bar |
| **Compaction before/after** | **Shipped** | Scrollback banner: `Compacted 90K → 24K (saved 66K) in 1.2s` |
| **Auto skills + MCP** | **Shipped** | Skills: `~/.logan`, `~/.grok`, claude/cursor/agents. MCP: config.toml, `.mcp.json`, cursor/claude |
| **One-command install** | **Shipped** | `bash scripts/install-logan.sh` + [LLM_INSTALL_PROMPT.md](LLM_INSTALL_PROMPT.md) |
| **Token visibility guide** | **Shipped** | [TOKEN_VISIBILITY.md](TOKEN_VISIBILITY.md) - full story for devs |

---

## Remote agent: is it possible?

**Yes.** Logan is already designed as a non-interactive agent host:

```bash
# Fire-and-forget coding task, JSON out (includes usage when provider returns it)
logan -p "Summarize this repo in 5 bullets" \
  --output-format json \
  --always-approve \
  -m claude-sonnet

# Structured output for another agent
logan -p "Extract todos as JSON" \
  --json-schema '{"type":"object","properties":{"todos":{"type":"array","items":{"type":"string"}}}}' \
  --always-approve

# Long-lived protocol for IDEs / agents
logan agent stdio
```

Wrap with HTTP when you want multi-tenant remote:

- Script: `examples/scripts/logan-agent-server.py`
- Guide: [REMOTE_AGENT.md](REMOTE_AGENT.md)

Safety: sandbox, `--allow`/`--deny`, `--tools`, network isolation, auth on the HTTP wrapper. Do **not** expose bare YOLO Logan to the public internet without auth.

---

## Token visibility & stats (shipped - primary product surface)

**Canonical guide:** [TOKEN_VISIBILITY.md](TOKEN_VISIBILITY.md)

Logan answers three questions without leaving the TUI:

| Question | Command / surface |
| --- | --- |
| How full is the window **right now**? | Status bar `24K/200K 12%` + last `in/out/c` |
| What did the **API bill** this session? | **`/stats`** - colorful IN / OUT / CACHE / REASON / $ by model |
| **What text** is eating the window? | **`/context deep`** - real `system_prompt.txt` + `chat_history.jsonl` |

### Surfaces

| Surface | Shows |
| --- | --- |
| Status bar | Fill % · last sample in/out/cache · `m`/`s`/`mcp` chips · `!` near compact |
| **`/stats`** | Session API ledger (bold colors) · by-model · last sample · est. $ |
| **`/context`** | Composition bar (system · messages · tools · free) + auto-compact line |
| **`/context deep`** | Same + color-coded previews of actual system prompt and messages |
| Compact banner | `Compacted before → after (saved N)` |
| `/session-info` | Session meta + triggers same token stats path |
| `/usage` | Product credits when the billing path applies |
| Headless JSON | `usage` when provider returns it |
| OTEL metrics | `input` / `output` / `reasoning` / `cache_read` |
| Scripts | `dump-prompt-journey.sh` · `logan-call.sh` · `usage-rollup.py` |

### Color legend (`/stats` + deep dive)

| Color | Field |
| --- | --- |
| Teal | IN / system prompt |
| Green | OUT / assistant |
| Violet | CACHE / tools |
| Amber | REASON / compact pressure |
| Brand accent | $ / user messages |

Local ledger extras: `examples/config/observability.toml` +
`examples/scripts/usage-rollup.py`.

---

## Smart auto-routing (token saver)

**Goal:** cheap model for triage / search / small edits; premium only when needed.

```text
classify task size/risk
   |
   +-- trivial (docs typo, short Q)     -> tier-fast   (flash, haiku, ollama)
   +-- standard implement              -> tier-default
   +-- hard (arch, multi-file, debug)  -> tier-premium
   +-- offline / private               -> tier-local
```

**Shipped:** pre-turn classifier via CLI:

```bash
logan -p "…" --route auto
logan -p "…" --route premium
logan --route tier-local -p "…"
```

Config: [examples/config/auto-routing.toml](../examples/config/auto-routing.toml)

---

## LiteLLM + Langfuse (best-in-class logging)

### LiteLLM (gateway)

One proxy for Bedrock, Azure, Vertex, rate limits, budgets:

```toml
[model.litellm]
model = "claude-sonnet-4"
base_url = "http://localhost:4000/v1"
env_key = "LITELLM_API_KEY"
```

LiteLLM already logs requests; point Langfuse at LiteLLM **or** at Logan OTEL.

### Langfuse (traces)

Logan can emit OpenTelemetry. Point OTLP HTTP at Langfuse’s OTEL endpoint
(or collector → Langfuse):

```toml
# See examples/config/observability.toml
[telemetry]
# enable external OTEL when your build exposes it
```

Env pattern (typical Langfuse OTEL):

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://cloud.langfuse.com/api/public/otel"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <langfuse_b64>"
```

Exact keys depend on Langfuse project settings - keep secrets out of git.

---

## `/goal` (Claude Code-class)

You **already have** it:

```text
/goal Ship token stats dashboard
/goal status
/goal pause
/goal resume
/goal clear
```

If the slash command is missing, enable goal mode (`GROK_GOAL=1` or config
feature flag) so the `update_goal` tool is in the toolset.

---

## Per-skill / per-subagent models

| Mechanism | Status |
| --- | --- |
| Skill frontmatter `model:` / `effort:` | **Supported** |
| Agent/subagent frontmatter `model: inherit\|id` | **Supported** |
| Web search / summary / image models in config | **Supported** |
| Goal planner/strategist models | **Supported** (flags) |
| Example agents + assignment TOML | **Shipped** - see [MODEL_ROUTING.md](MODEL_ROUTING.md) |

## Automations / schedules

| Mechanism | Status |
| --- | --- |
| `/loop`, `scheduler_create/list/delete`, `monitor` | **Supported** in-session |
| OS cron / launchd / Task Scheduler + headless | **Documented** - [AUTOMATIONS.md](AUTOMATIONS.md) |
| Wake sleeping computer | **OS power**, not Logan-core |

## Prompt journey with real token picture

Concrete walkthrough: [PROMPT_JOURNEY_WALKTHROUGH.md](PROMPT_JOURNEY_WALKTHROUGH.md)

## Priority build order (product)

1. **Local usage jsonl + `/stats` UX** - devs feel control immediately  
2. **Auto-route tiers + native `--route auto`** - real token savings  
3. **Langfuse OTEL recipe** - team observability  
4. **HTTP remote agent** hardened (auth, sandbox, quotas)  
5. **Cost tables** per model in config  
6. **UI for models-per-role** map  

---

## Related

- [REMOTE_AGENT.md](REMOTE_AGENT.md)
- [SETUP.md](SETUP.md)
- [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)
- [examples/config/auto-routing.toml](../examples/config/auto-routing.toml)
- [examples/config/observability.toml](../examples/config/observability.toml)
