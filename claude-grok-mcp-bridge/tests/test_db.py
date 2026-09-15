from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_message_flow(db):
    sent = await db.send_message(
        to="grok",
        subject="Hello",
        body="Hi Grok",
        as_side="claude",
    )
    assert sent["id"].startswith("msg_")
    assert sent["to"] == "grok"
    assert sent["from"] == "claude"
    assert sent["read_by"]["claude"] is True
    assert sent["read_by"]["grok"] is False

    unread = await db.list_messages(for_side="grok", unread_only=True)
    assert len(unread) == 1
    assert unread[0]["id"] == sent["id"]

    await db.mark_read(message_id=sent["id"], as_side="grok")
    unread2 = await db.list_messages(for_side="grok", unread_only=True)
    assert unread2 == []

    reply = await db.reply_message(message_id=sent["id"], body="Hey Claude", as_side="grok")
    assert reply["thread_id"] == sent["thread_id"]
    assert reply["parent_id"] == sent["id"]
    assert reply["subject"].lower().startswith("re:")
    assert reply["to"] == "claude"


@pytest.mark.asyncio
async def test_task_lifecycle(db):
    task = await db.create_task(
        title="Ship bridge",
        brief="Implement MCP tools",
        assign_to="grok",
        as_side="claude",
        metadata={"priority": "high"},
    )
    assert task["status"] == "open"
    assert task["metadata"]["priority"] == "high"

    updated = await db.update_task(
        task_id=task["id"],
        status="in_progress",
        as_side="grok",
    )
    assert updated["status"] == "in_progress"
    assert updated["updated_by"] == "grok"

    done = await db.update_task(
        task_id=task["id"],
        status="done",
        as_side="grok",
        result="All green",
    )
    assert done["status"] == "done"
    assert done["result"] == "All green"

    listed = await db.list_tasks(status="done", assign_to="grok")
    assert len(listed) == 1

    status = await db.bridge_status()
    assert status["ok"] is True
    assert status["tasks_by_status"]["done"] == 1
