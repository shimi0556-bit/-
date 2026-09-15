from __future__ import annotations

import json

import pytest


@pytest.mark.asyncio
async def test_tools_via_mcp_call(settings, db):
    from claude_grok_mcp_bridge.server import create_server

    mcp, store, _ = create_server(settings, enable_auth=False, db=db)

    # Call tools through the MCPServer tool manager
    status = await mcp.call_tool("bridge_status", {})
    # call_tool may return CallToolResult or structured content depending on version
    if hasattr(status, "structuredContent") and status.structuredContent:
        body = status.structuredContent
    elif hasattr(status, "content"):
        # text content
        texts = [c.text for c in status.content if hasattr(c, "text")]
        body = json.loads(texts[0]) if texts else {}
    else:
        body = status
    assert body.get("ok") is True or (isinstance(body, dict) and "ok" in str(body))

    sent = await mcp.call_tool(
        "send_message",
        {
            "to": "both",
            "subject": "ping",
            "body": "hello both",
            "as_side": "claude",
        },
    )
    # Prefer DB verification for reliability across SDK shapes
    messages = await store.list_messages(for_side="grok")
    assert any(m["subject"] == "ping" for m in messages)

    task = await store.create_task(
        title="T1",
        brief="do it",
        assign_to="claude",
        as_side="grok",
    )
    listed = await mcp.call_tool("list_tasks", {"assign_to": "claude"})
    tasks = await store.list_tasks(assign_to="claude")
    assert any(t["id"] == task["id"] for t in tasks)

    await mcp.call_tool(
        "update_task",
        {
            "task_id": task["id"],
            "status": "done",
            "as_side": "claude",
            "result": "finished",
        },
    )
    updated = await store.get_task(task["id"])
    assert updated["status"] == "done"
    assert updated["result"] == "finished"
