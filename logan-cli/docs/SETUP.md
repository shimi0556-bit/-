# Logan - quick setup guide

For humans **and** for coding agents / LLMs installing Logan on a machine.

**Author:** Yuval Avidani (YUV.AI) - https://yuv.ai · GitHub [@hoodini](https://github.com/hoodini)

> **New here?** One command:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.sh | bash
> ```
>
> Windows: `irm https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.ps1 | iex`  
> Super short: **[START_HERE.md](START_HERE.md)** · Tokens: **[TOKEN_VISIBILITY.md](TOKEN_VISIBILITY.md)**

---

## 0. Goal checklist

After this guide you should have:

1. `logan` on PATH (`~/.local/bin` **and** `~/.logan/bin` - same binary)  
2. `~/.logan/config.toml` with memory + compat skills/MCP  
3. Auth via account login, Grok Build import, or `XAI_API_KEY` (see below)  
4. A first successful prompt + `/stats` in the TUI  

### Auth vs which LLM you use

These are **two different layers**:

| Layer | What it decides | How you set it |
| --- | --- | --- |
| **Session / account** | Identity for **default xAI** models | `logan login`, `logan login --from-grok`, or auto-import from `~/.grok` |
| **Per-model keys (BYOK)** | Which **LLM endpoint** answers | `[model.*] api_key` / `env_key` / `base_url` in config |
| **Env API key** | Fallback for xAI when no session | `XAI_API_KEY` |

**Resolution order for each turn** (already in the agent):

1. Selected model has its own `api_key` / `env_key` → **that LLM** (Grok session is ignored for the request)  
2. Else Logan session in `~/.logan/auth.json` (OIDC) → xAI account  
3. Else `XAI_API_KEY`  

**Grok Build import rules:**

- **Auto:** if Logan has no usable session, Logan may copy OIDC from `~/.grok/auth.json`  
- **Skip auto when:** you set `XAI_API_KEY`, pin `[auth] preferred_method = "api_key"`, set `LOGAN_NO_IMPORT_GROK_AUTH=1`, or ran `logan logout` (sentinel)  
- **Explicit:** `logan login --from-grok` always copies (clears the logout sentinel)  
- **Pin OIDC only:** `[auth] preferred_method = "oidc"`  

```bash
logan login              # browser (xAI user)
logan login --from-grok  # reuse Grok Build account session
logan login --device-auth
export XAI_API_KEY=...   # no browser; wins only when no session (unless preferred_method=api_key)
```

---

## 1. Prerequisites

| Tool | Why |
| --- | --- |
| macOS or Linux | Primary supported hosts |
| `git`, `curl` | Clone / install |
| Rust 1.92+ via rustup | Build from source |
| `protoc` | Proto codegen |
| Node.js + `npx` | Optional MCP servers (Excalidraw) |
| API keys | Your chosen LLM provider(s) |

---

## 2. Install Logan (from source)

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Clone
git clone https://github.com/hoodini/logan-cli.git
cd logan-cli

# Build release binary
cargo build -p xai-grok-pager-bin --release

# Install to PATH
mkdir -p "$HOME/.local/bin"
cp target/release/logan "$HOME/.local/bin/logan"
export PATH="$HOME/.local/bin:$PATH"

logan --version
# expect: logan 0.1.x  and about line with Yuval Avidani (YUV.AI)
```

Optional: `brew install protoc` / use Anaconda `protoc`, and `brew install dotslash` for repo `bin/protoc`.

---

## 3. First config directory

```bash
mkdir -p ~/.logan/memory ~/.logan/hooks/bin
```

Config file: **`~/.logan/config.toml`**  
Override root with env: **`LOGAN_HOME`**.

---

## 4. Choose and configure an LLM

Logan supports three backends:

| `api_backend` | Typical providers |
| --- | --- |
| `chat_completions` | OpenAI, OpenRouter, Gemini OpenAI-compat, Ollama, LM Studio, LiteLLM |
| `responses` | OpenAI Responses, some xAI-style APIs |
| `messages` | Anthropic |

### Fast path - copy presets

```bash
# From the repo root:
cat examples/config/providers.toml >> ~/.logan/config.toml
```

Then set the default model and API keys.

### Minimal Anthropic example

```toml
# ~/.logan/config.toml
[models]
default = "claude-sonnet"

[model.claude-sonnet]
model = "claude-sonnet-4-5"
base_url = "https://api.anthropic.com/v1"
name = "Claude Sonnet"
api_backend = "messages"
context_window = 200000
env_key = "ANTHROPIC_API_KEY"
extra_headers = { "anthropic-version" = "2023-06-01" }
```

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
logan -m claude-sonnet -p "Reply with: logan-ok"
```

### Minimal OpenAI

```toml
[models]
default = "gpt-4o"

[model.gpt-4o]
model = "gpt-4o"
base_url = "https://api.openai.com/v1"
env_key = "OPENAI_API_KEY"
context_window = 128000
```

```bash
export OPENAI_API_KEY="sk-..."
```

### OpenRouter

```toml
[model.openrouter-auto]
model = "openrouter/auto"
base_url = "https://openrouter.ai/api/v1"
env_key = "OPENROUTER_API_KEY"
extra_headers = { "HTTP-Referer" = "https://yuv.ai", "X-Title" = "Logan CLI" }
```

### Ollama (local)

```bash
ollama serve
ollama pull qwen2.5-coder:14b
```

```toml
[model.ollama-qwen]
model = "qwen2.5-coder:14b"
base_url = "http://localhost:11434/v1"
name = "Qwen (Ollama)"
context_window = 32768
```

### LM Studio

```toml
[model.lmstudio]
model = "local-model"
base_url = "http://localhost:1234/v1"
```

### Gemini

```toml
[model.gemini-flash]
model = "gemini-2.5-flash"
base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
env_key = "GEMINI_API_KEY"
context_window = 1000000
```

### AWS Bedrock

Native SigV4 is not built in. Run [LiteLLM](https://docs.litellm.ai/) as a proxy
and point Logan at it (see `examples/config/providers.toml`).

### List / switch models

```bash
logan models
logan -m claude-sonnet -p "hi"
# inside TUI:
/model openrouter-auto
```

Full matrix: [examples/config/providers.toml](../examples/config/providers.toml)

---

## 5. Enable memory + learning (recommended)

```toml
[memory]
enabled = true

[memory.session]
save_on_end = true

[memory.dream]
enabled = true

[memory.initial_injection]
enabled = true
```

```bash
cp examples/config/USER_PREFERENCES.template.md ~/.logan/memory/MEMORY.md
# edit Preferences for the human user
```

Or: `logan --experimental-memory` / `export GROK_MEMORY=1`.

---

## 6. Auto post-turn reflection hooks

Install Logan's reflection hooks (appends lesson stubs when a turn/session ends):

```bash
mkdir -p ~/.logan/hooks/bin
cp examples/hooks/auto-reflect.json ~/.logan/hooks/
cp examples/hooks/bin/auto-reflect.py ~/.logan/hooks/bin/
chmod +x ~/.logan/hooks/bin/auto-reflect.py
```

Events: **`Stop`** (agent finished a turn) and **`SessionEnd`**.

Logs: `~/.logan/memory/reflections.log`  
Durable appends: `~/.logan/memory/MEMORY.md` under `## Auto reflections`

---

## 7. MCP connectors (Excalidraw)

### Preferred - Grok Build website connectors

Logan inherits the Grok Build MCP connector stack. **Connect Excalidraw (and
other servers) from the Grok Build website connectors UI.** That is the
supported product path we use - no local Node process required once the
connector is linked to your account/session.

After connecting on the website, start `logan` and confirm the server is
visible via `/mcp` or `logan mcp list` (depending on your build/features).

### Optional local fallback (stdio / npx)

For offline or custom setups only:

```toml
# examples/config/mcp-excalidraw.toml
[mcp_servers.excalidraw]
command = "npx"
args = ["-y", "excalidraw-mcp"]
```

```bash
cat examples/config/mcp-excalidraw.toml >> ~/.logan/config.toml
```

Repo diagrams are also plain files under `docs/architecture/*.excalidraw`
(open on [excalidraw.com](https://excalidraw.com) with drag-and-drop - no MCP).

---

## 8. First run

```bash
cd /path/to/your/project
logan
# or non-interactive:
logan -p "Summarize this repo in 5 bullets" --always-approve
```

Useful slash commands:

| Command | Purpose |
| --- | --- |
| `/model` | Switch LLM |
| `/caveman full` | Terse talk mode (save tokens) - off/lite/full/ultra |
| `/think full` | Deep explain (yuvai-thinking) - exclusive with caveman |
| `/ponytail full` | YAGNI / minimal code mode |
| `/modes` · `/creative` | Mode status · creative stack map |
| `/site mouse clip.mp4` | Cinematic mouse-scrub landing |
| `/reel clip.mp4` | Captioned HyperFrames reel |
| `/whoami grill` | Identity + stack interview → PROFILE.md |
| `/improve` | Self-heal / self-improve dashboard |
| `/memory on` | Enable memory this session |
| `/remember ...` | Save a durable fact |
| `/flush` | Rich session summary to memory |
| `/mcp` | MCP servers |
| `/help` | Help |

Modes: **[MODES.md](MODES.md)** · Creative stack: **[CREATIVE.md](CREATIVE.md)**

---

## 9. Instructions for LLM / coding agents

If you are an AI installer, follow this order **exactly**:

1. Check `logan --version`. If missing, clone `hoodini/logan-cli` and
   `cargo build -p xai-grok-pager-bin --release`; copy binary to
   `$HOME/.local/bin/logan`.
2. Ensure `PATH` includes `$HOME/.local/bin` and `$HOME/.cargo/bin`.
3. Create `$LOGAN_HOME` or `~/.logan`.
4. Write `config.toml` with **one** working `[model.*]` + `[models].default`.
5. Export the matching API key env var (do not commit secrets).
6. Enable `[memory] enabled = true`.
7. Optionally install auto-reflect hooks and Excalidraw MCP from `examples/`.
8. Smoke test: `logan -p "ping" -m <model>` and confirm a non-error reply.
9. Prefer reading `docs/ARCHITECTURE.md` and `docs/COMPARISON.md` before large
   refactors.
10. Never store API keys in MEMORY.md or git.

Success criteria: `logan --version` works, smoke prompt returns model text,
config lives under `~/.logan`.

---

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `logan: command not found` | Export PATH; reinstall binary |
| Auth browser opens for xAI | Use BYOK custom models; set `api_key`/`env_key` on `[model.*]` |
| Model not found | `logan models`; check `[model.<id>]` name vs `-m` |
| Anthropic 401 | Use `messages` backend + correct key headers |
| Ollama connection refused | `ollama serve` and correct `base_url` |
| Memory not recalling | Enable memory; `/flush`; wait for index |
| Hooks not firing | Files under `~/.logan/hooks/`; executable bit on scripts |

---

## Related docs

- [COMPARISON.md](COMPARISON.md) - Logan vs Grok Build OSS  
- [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)  
- [examples/config/providers.toml](../examples/config/providers.toml)  
- Upstream-style guides in `crates/codegen/xai-grok-pager/docs/user-guide/`
