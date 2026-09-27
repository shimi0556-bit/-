# claude-grok-mcp-bridge

Python MCP server — shared mailbox and task board between Claude and Grok Bot (Streamable HTTP + OAuth, or local stdio). Local pack, not vendored from an external source. Pairs with the `claude-grok-bridge` skill (see `claude-skills.md`).

- **Needs:** a local `BRIDGE_TOKEN` (see `.env.example`; no secrets committed)
- **Run:** `cd claude-grok-mcp-bridge && cp .env.example .env && uv sync --group dev && uv run claude-grok-mcp-bridge http`

## Notes
_(empty)_
