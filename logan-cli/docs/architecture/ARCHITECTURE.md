# Logan Architecture

**Author:** Yuval Avidani (YUV.AI) - AI Builder & Speaker  
Web: [yuv.ai](https://yuv.ai) · GitHub: [hoodini](https://github.com/hoodini) · X: [@yuvalav](https://x.com/yuvalav)

**Vibe:** inspired by Wolverine - heal, adapt, claws out for hard bugs (fan
tribute aesthetic, not affiliated with Marvel).

This document explains how Logan runs a prompt from keystroke to model response,
how memory and sessions work, how the system prompt is built, and how to plug
in multiple LLM providers. Open the companion Excalidraw files in
[excalidraw.com](https://excalidraw.com) (drag-and-drop).

| Diagram | File |
| --- | --- |
| Prompt lifecycle | [01-prompt-lifecycle.excalidraw](./01-prompt-lifecycle.excalidraw) |
| Memory / sessions / context | [02-memory-sessions-context.excalidraw](./02-memory-sessions-context.excalidraw) |
| System prompt layers | [03-system-prompt-composition.excalidraw](./03-system-prompt-composition.excalidraw) |
| Providers + self-improve | [04-providers-self-improve.excalidraw](./04-providers-self-improve.excalidraw) |

Fork base: [xAI Grok Build](https://github.com/xai-org/grok-build) (Apache-2.0).

---

## 1. Prompt lifecycle (end-to-end)

```text
User types prompt (TUI / headless / ACP)
        |
        v
logan binary (xai-grok-pager-bin)
  clap parse, cwd, leader/stdio modes
        |
        v
Session actor (xai-grok-shell)
  handle_prompt: slash commands, skills rewrite, bash prefix
        |
        v
ChatStateActor (xai-chat-state)
  prune old tool results if ~50% of context used
  inject <memory-context> when memory is on
  attach tool schemas
        |
        v
Sampler (xai-grok-sampler)
  ApiBackend: chat_completions | responses | messages
  stream tokens + tool_calls
        |
        v
Tool loop (xai-grok-tools + MCP + skills)
  execute -> append results -> sample again until end_turn
        |
        v
Stream to TUI + persist updates.jsonl / chat_history.jsonl
```

**Key source paths**

| Stage | Path |
| --- | --- |
| Binary | `crates/codegen/xai-grok-pager-bin/src/main.rs` |
| CLI | `crates/codegen/xai-grok-pager/src/app/cli.rs` |
| Turn | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs` |
| Request build | `crates/codegen/xai-chat-state/` |
| HTTP LLM | `crates/codegen/xai-grok-sampler/` |
| Tools | `crates/codegen/xai-grok-tools/` |

---

## 2. Short-term memory vs long-term memory

### Short-term (session)

- Lives in the **ChatStateActor** conversation vector for the active session.
- Durably written under:

```text
~/.logan/sessions/<encoded-cwd>/<session-id>/
  updates.jsonl        # resume authority
  chat_history.jsonl   # model-facing history
  summary.json
  feedback.jsonl
  ...
```

- Old **tool results** are soft-pruned around **50%** of the model context window.
- Compaction can replace long history with a summary while keeping replay data.

### Long-term (cross-session)

Enabled with any of:

```bash
logan --experimental-memory
# or
export GROK_MEMORY=1
```

```toml
# ~/.logan/config.toml
[memory]
enabled = true
```

Storage:

```text
~/.logan/memory/
  MEMORY.md                         # global (preferences, habits)
  <project-slug>-<hash>/
    MEMORY.md                       # project facts
    sessions/YYYY-MM-DD-*.md        # session logs
    index.sqlite                    # FTS5 + optional vectors
```

| Mechanism | Role |
| --- | --- |
| `/remember` | Append a durable note (with confirm UI) |
| `/flush` | LLM summary of important session knowledge |
| Session end | Lightweight metadata summary (no extra LLM) |
| **autoDream** | Consolidates session logs into evergreen MEMORY.md |
| `memory_search` / `memory_get` tools | Agent retrieves relevant chunks mid-task |

First-turn (and post-compaction) search injects a `<memory-context>...</memory-context>`
block into the system message so the model sees relevant past facts without
reloading full history.

---

## 3. Sessions

| Action | How |
| --- | --- |
| New | Default on launch; UUIDv7 id |
| Resume | `logan --continue` / `-c`, or `--resume <id>` |
| List | `logan sessions` / TUI session picker |
| Fork | Fork session keeps history branch |

Sessions are **per working directory** (encoded path). Resume uses `updates.jsonl`
as the event log.

---

## 4. System prompt: how it is built (and length)

There is **no single fixed token length**. The prompt is layered at runtime.

### Layers (see diagram 03)

1. **Base template** - `crates/codegen/xai-grok-agent/templates/prompt.md`  
   Identity, action safety, tool-calling rules, formatting. Label defaults to
   the product name (Logan).
2. **Tool schemas** - JSON tools on the API request (largest variable cost).
3. **Skills catalog** - discovered skill names + short descriptions (budgeted).
4. **Project instructions** - `AGENTS.md`, `Claude.md`, `.logan/rules/`, Cursor rules.
5. **Memory** - tool section when enabled + optional `<memory-context>` injection.
6. **Role / persona / custom system prompt** - config overrides.
7. **Self-improve + preferences** - content from `MEMORY.md` (`## Preferences`,
   `## Lessons`) after dream/flush/learn-user skill.

After compaction, a shorter **COMPACT_SYSTEM_PROMPT** is used so the summary
fit stays efficient.

Inspect live composition via agent prompt-context dumps when debugging
(`PromptContext` in `xai-grok-agent/src/prompt/context.rs`).

Default coding model context (upstream catalog): **500k** tokens for
`grok-build`. Custom models set `context_window` per `[model.*]`.

Auto-compact default: about **85%** of `context_window`
(`[session] auto_compact_threshold_percent`).

---

## 5. Skills, connectors (MCP), plugins

| Extension | What | Where |
| --- | --- | --- |
| **Skills** | Markdown playbooks the agent can load | `~/.logan/skills`, project skills, bundled |
| **MCP** | External tools (GitHub, DBs, design, …) | **Grok Build website connectors (preferred)** or `[mcp_servers.*]` |
| **Excalidraw** | Diagrams | Connect via **Grok Build website connectors**; optional local `npx` fallback in `examples/config/mcp-excalidraw.toml` |
| **Plugins** | Bundles of skills + MCP + hooks | marketplace / `~/.logan/plugins` |
| **Hooks** | Lifecycle scripts on turns/tools | `xai-grok-hooks` + `examples/hooks/auto-reflect` |

Bundled self-improve skills (Logan):

- `self-improve` - reflect on what worked / failed; write lessons
- `learn-user` - extract and store user preferences

---

## 6. Multi-provider LLMs

Logan already speaks three wire protocols:

| `api_backend` | Protocol |
| --- | --- |
| `chat_completions` | OpenAI `/v1/chat/completions` (default) |
| `responses` | OpenAI `/v1/responses` (xAI default for grok-build) |
| `messages` | Anthropic `/v1/messages` |

Any provider that exposes one of these (or an OpenAI-compatible proxy) works
via `[model.<name>]` in `~/.logan/config.toml`.

**Ready-made presets:** [examples/config/providers.toml](../../examples/config/providers.toml)

| Provider | Typical path |
| --- | --- |
| Anthropic | `api_backend = "messages"` + `extra_headers` x-api-key |
| OpenAI | `chat_completions` or `responses` + `OPENAI_API_KEY` |
| Gemini | OpenAI-compat endpoint or LiteLLM proxy |
| OpenRouter | `base_url = "https://openrouter.ai/api/v1"` |
| AWS Bedrock | Via **LiteLLM** or Bedrock OpenAI-compat proxy (native SigV4 not built-in) |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| LiteLLM | Point `base_url` at your LiteLLM proxy |

```bash
logan models
logan -m claude-opus -p "hello"
# or in TUI:
/model claude-opus
```

---

## 7. Self-improve (Hermes-style learning)

Logan does **not** retrain model weights. It learns the way strong agent
harnesses do:

1. **Observe** - session logs, tool outcomes, user corrections, feedback.jsonl
2. **Reflect** - `/flush`, dream consolidation, `self-improve` skill
3. **Store** - durable markdown in `~/.logan/memory/MEMORY.md`
4. **Retrieve** - hybrid search injects lessons on later turns
5. **Prefer** - `learn-user` skill keeps `## Preferences` (style, risk, PR habits)

### Enable learning loop

```toml
[memory]
enabled = true

[memory.session]
save_on_end = true

[memory.dream]
enabled = true
min_sessions = 3
min_hours = 4

[memory.initial_injection]
enabled = true
```

Suggested workflow:

```text
After a hard task:
  /flush                          # capture decisions
  /skill self-improve             # distill what worked / failed
  /skill learn-user               # update Preferences about you

Later sessions:
  memory_search pulls those lessons automatically
```

Seed a personal profile (edit freely):

```bash
mkdir -p ~/.logan/memory
# see examples/config/USER_PREFERENCES.template.md
```

---

## 8. Crate map (implementation)

| Layer | Crate |
| --- | --- |
| Binary / TUI | `xai-grok-pager-bin`, `xai-grok-pager` |
| Session / agent | `xai-grok-shell` |
| Prompt build | `xai-grok-agent` |
| Conversation | `xai-chat-state` |
| LLM HTTP | `xai-grok-sampler`, `xai-grok-sampling-types` |
| Memory | `xai-grok-memory` |
| Compaction | `xai-grok-compaction` |
| Tools / MCP | `xai-grok-tools`, `xai-grok-mcp` |

---

## 9. Roadmap (product goals)

| Goal | Status |
| --- | --- |
| Multi-provider via config | **Supported** (presets shipped) |
| Native Bedrock SigV4 | Not yet - use LiteLLM/proxy |
| Memory + dream | **Supported** (opt-in) |
| Self-improve skills | **Shipped** (skill-driven) |
| Automatic outcome scorer | Planned (hooks + feedback schema) |
| Full crate rename xai-grok-* | Deferred |

Maintained by **Yuval Avidani (YUV.AI)**.
