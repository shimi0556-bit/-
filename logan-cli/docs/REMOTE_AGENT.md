# Logan as a remote / tool agent for other AIs

**Yes - this is possible today.** Logan is not only a human TUI. It is a
coding agent host you can call from scripts, CI, or another LLM tool.

Author: Yuval Avidani (YUV.AI) · https://yuv.ai

---

## Pattern A - Headless CLI (simplest)

Another agent shells out:

```bash
logan -p "In /repo, add tests for parser and run them" \
  --cwd /repo \
  -m claude-sonnet \
  --output-format json \
  --always-approve \
  --max-turns 40
```

| Flag | Why it matters for agents |
| --- | --- |
| `-p` / `--single` | Non-interactive single prompt (or continue with `-c` / `-r`) |
| `--output-format json` | Machine-readable result (+ usage when available) |
| `--output-format streaming-json` | Progressive events |
| `--json-schema '{…}'` | Force structured JSON answer |
| `--always-approve` / allow-deny rules | Unattended tool use |
| `--tools` / `--disallowed-tools` | Shrink blast radius |
| `--max-turns` | Cap cost / loops |
| `-m` | Pin model or routing tier |

Wrapper with usage logging:

```bash
examples/scripts/logan-call.sh "Fix the failing unit tests"
```

---

## Pattern B - Stdio ACP (IDE / long-lived)

```bash
logan agent stdio
```

Agent Client Protocol over stdio - editors and agent frameworks can attach a
persistent session, stream tool calls, and manage permissions.

---

## Pattern C - HTTP remote agent (multi-caller)

```bash
# binds 127.0.0.1 by default - put behind auth / reverse proxy for real remotes
python3 examples/scripts/logan-agent-server.py --port 8787

curl -s localhost:8787/v1/run -H 'content-type: application/json' -d '{
  "prompt": "List top 3 TODOs in this repo",
  "cwd": "/Users/you/project",
  "model": "claude-sonnet",
  "max_turns": 20
}'
```

Response shape (simplified):

```json
{
  "ok": true,
  "text": "…",
  "usage": { "input_tokens": 1200, "output_tokens": 400 },
  "model": "claude-sonnet",
  "exit_code": 0
}
```

### Security checklist (mandatory for remote)

1. Bind localhost or private network only  
2. Shared secret / mTLS / SSO in front of the server  
3. Sandbox profile + deny dangerous bash  
4. Per-caller quotas (turns, wall time, tokens)  
5. Never pass raw user secrets into logs (Langfuse redaction)  
6. Prefer read-only tool allowlists for untrusted prompts  

---

## Pattern D - Logan as a tool inside another agent

Tool definition sketch for an outer agent:

```json
{
  "name": "logan_code_agent",
  "description": "Delegate a software engineering task to Logan CLI with full repo tools",
  "parameters": {
    "type": "object",
    "properties": {
      "prompt": { "type": "string" },
      "cwd": { "type": "string" },
      "model": { "type": "string" },
      "max_turns": { "type": "integer" }
    },
    "required": ["prompt"]
  }
}
```

Implementation = `logan-call.sh` or HTTP `/v1/run`.

---

## Tokens & tracing for agent traffic

- Prefer `--output-format json` and persist `usage` into `~/.logan/stats/usage.jsonl`
- Route models through **LiteLLM** for central budgets  
- Export OTEL → **Langfuse** for full traces  

See [FEATURES.md](FEATURES.md) and `examples/config/observability.toml`.

---

## What is *not* magic yet

| Wish | Status |
| --- | --- |
| Auto pick cheapest model per task | Config tiers + skill today; native `--route auto` planned |
| Beautiful `/stats` TUI | `/context` + `/session-info` today; richer rollup planned |
| Zero-setup public SaaS remote | You must host + secure the wrapper |

The architecture already supports **prompt in → agent work → response out**.
Productizing routing, stats, and remote hardening is the next layer - not a
rewrite of the agent loop.
