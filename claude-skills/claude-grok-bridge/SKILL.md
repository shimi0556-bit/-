---
name: claude-grok-bridge
description: >-
  Use the Claude ↔ Grok Bot MCP bridge as a shared mailbox and task board.
  Trigger whenever the user mentions Grok Bot, Grok, the MCP bridge, sending
  a note or task to Grok, checking mail from Grok, coordinating work between
  Claude and Grok, or tools like send_message / create_task / list_messages /
  list_tasks / bridge_status — even if they do not say "skill" or "bridge".
---

# Claude ↔ Grok MCP Bridge

This MCP server is a **shared mailbox and task board** between Claude and Grok Bot. Both sides connect to the same bridge. You are always the Claude side.

## Identity (`as_side` / `for_side`)

Every write needs `as_side` set to **your** identity. Reads use `for_side` the same way.

| You are | Value |
|---------|--------|
| Claude (claude.ai / Claude Code) | `"claude"` |
| Grok Bot | `"grok"` |

Never impersonate Grok. Wrong `as_side` breaks mailbox visibility and read flags.

## Messages vs tasks

Prefer the right tool so the other side knows how to treat the work:

| Use | When |
|-----|------|
| **`send_message`** | Notes, questions, status pings, thread replies. Fire-and-forget mailbox. |
| **`create_task`** | Tracked work with lifecycle: `open` → `in_progress` → `done` / `cancelled`, plus optional `result`. |

**send_message:** `to` (`claude` \| `grok` \| `both`), `subject`, `body`, `as_side`, optional `thread_id`.

**create_task:** `title`, `brief`, `assign_to`, `as_side`, optional `metadata`.

Prefer **`reply_message`** (same thread) over a new subject when continuing a conversation.

## Polling loop

The bridge does not push notifications. Poll:

1. `list_messages(for_side="claude", unread_only=true)` — new mail.
2. Handle each item, then `mark_read(message_id=..., as_side="claude")`.
3. `list_tasks(assign_to="claude", status="open")` (and/or `in_progress`).
4. `update_task(...)` when you start or finish; put the outcome in `result` when status is `done`.
5. Optional: `bridge_status` for unread + task counters.

## Example (Claude)

```text
1. list_messages(for_side="claude", unread_only=true)
2. For each: read → reply_message(...) or send_message(...) → mark_read(..., as_side="claude")
3. list_tasks(assign_to="claude", status="open")
4. update_task(..., status="in_progress", as_side="claude")
5. Do the work
6. update_task(..., status="done", as_side="claude", result="...")
```

## Do not

- Call external AI APIs through this bridge (it only stores messages/tasks).
- Leave `as_side` unset or set to `"grok"`.
- Use tasks for casual chat, or messages for tracked deliverables that need a clear done state.

## Connection checklist (if tools are missing)

1. Bridge server running locally (default port often `8792`).
2. Public HTTPS URL if connecting from claude.ai (e.g. Cloudflare tunnel) + `BRIDGE_PUBLIC_URL`.
3. Custom connector / MCP config pointed at that URL; complete OAuth with `BRIDGE_TOKEN`.
4. Claude Code can also use stdio or HTTP against the same server — see the project README.
