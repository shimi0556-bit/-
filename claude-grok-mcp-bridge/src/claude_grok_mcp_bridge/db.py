"""SQLite persistence for bridge messages and tasks."""

from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal

import aiosqlite

Side = Literal["claude", "grok"]
ToSide = Literal["claude", "grok", "both"]
TaskStatus = Literal["open", "in_progress", "done", "cancelled"]


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


class BridgeDB:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self._migrated = False

    @asynccontextmanager
    async def _conn(self) -> AsyncIterator[aiosqlite.Connection]:
        """Open a fresh aiosqlite connection for one operation."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys = ON")
            if not self._migrated:
                await self._migrate(db)
                self._migrated = True
            yield db

    async def connect(self) -> aiosqlite.Connection:
        """Open a connection (caller must close). Prefer `_conn` for new code."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = await aiosqlite.connect(self.path)
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        await self._migrate(db)
        self._migrated = True
        return db

    async def _migrate(self, db: aiosqlite.Connection) -> None:
        await db.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                to_side TEXT NOT NULL,
                from_side TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                parent_id TEXT,
                created_at TEXT NOT NULL,
                read_by_claude INTEGER NOT NULL DEFAULT 0,
                read_by_grok INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
            CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                brief TEXT NOT NULL,
                assign_to TEXT NOT NULL,
                status TEXT NOT NULL,
                result TEXT,
                metadata TEXT,
                created_by TEXT NOT NULL,
                updated_by TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_assign ON tasks(assign_to);
            """
        )
        await db.commit()

    async def send_message(
        self,
        *,
        to: ToSide,
        subject: str,
        body: str,
        as_side: Side,
        thread_id: str | None = None,
        parent_id: str | None = None,
    ) -> dict[str, Any]:
        msg_id = _new_id("msg")
        tid = thread_id or _new_id("thr")
        created = _utc_now()
        async with self._conn() as db:
            await db.execute(
                """
                INSERT INTO messages (
                    id, thread_id, to_side, from_side, subject, body,
                    parent_id, created_at, read_by_claude, read_by_grok
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    msg_id,
                    tid,
                    to,
                    as_side,
                    subject,
                    body,
                    parent_id,
                    created,
                    1 if as_side == "claude" else 0,
                    1 if as_side == "grok" else 0,
                ),
            )
            await db.commit()
        result = await self.get_message(msg_id)
        assert result is not None
        return result

    async def list_messages(
        self,
        *,
        for_side: Side,
        unread_only: bool = False,
        thread_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        limit = max(1, min(limit, 200))
        clauses = ["(to_side = ? OR to_side = 'both' OR from_side = ?)"]
        params: list[Any] = [for_side, for_side]

        if thread_id:
            clauses.append("thread_id = ?")
            params.append(thread_id)

        if unread_only:
            if for_side == "claude":
                clauses.append("read_by_claude = 0")
            else:
                clauses.append("read_by_grok = 0")

        where = " AND ".join(clauses)
        sql = f"""
            SELECT * FROM messages
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ?
        """
        params.append(limit)

        async with self._conn() as db:
            cur = await db.execute(sql, params)
            rows = await cur.fetchall()
        return [self._message_row(r) for r in rows]

    async def get_message(self, message_id: str) -> dict[str, Any] | None:
        async with self._conn() as db:
            cur = await db.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
            row = await cur.fetchone()
        return self._message_row(row) if row else None

    async def reply_message(
        self,
        *,
        message_id: str,
        body: str,
        as_side: Side,
    ) -> dict[str, Any]:
        parent = await self.get_message(message_id)
        if not parent:
            raise ValueError(f"Message not found: {message_id}")

        if parent["from"] == as_side:
            to: ToSide = parent["to"] if parent["to"] != "both" else "both"
            if to == as_side:
                to = "grok" if as_side == "claude" else "claude"
        else:
            to = parent["from"]

        subject = parent["subject"]
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        return await self.send_message(
            to=to,
            subject=subject,
            body=body,
            as_side=as_side,
            thread_id=parent["thread_id"],
            parent_id=message_id,
        )

    async def mark_read(self, *, message_id: str, as_side: Side) -> dict[str, Any]:
        col = "read_by_claude" if as_side == "claude" else "read_by_grok"
        async with self._conn() as db:
            cur = await db.execute(
                f"UPDATE messages SET {col} = 1 WHERE id = ?",
                (message_id,),
            )
            await db.commit()
            if cur.rowcount == 0:
                raise ValueError(f"Message not found: {message_id}")
        msg = await self.get_message(message_id)
        assert msg is not None
        return msg

    async def create_task(
        self,
        *,
        title: str,
        brief: str,
        assign_to: Side | ToSide,
        as_side: Side,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        task_id = _new_id("task")
        now = _utc_now()
        meta_json = json.dumps(metadata) if metadata is not None else None
        async with self._conn() as db:
            await db.execute(
                """
                INSERT INTO tasks (
                    id, title, brief, assign_to, status, result, metadata,
                    created_by, updated_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'open', NULL, ?, ?, NULL, ?, ?)
                """,
                (task_id, title, brief, assign_to, meta_json, as_side, now, now),
            )
            await db.commit()
        task = await self.get_task(task_id)
        assert task is not None
        return task

    async def get_task(self, task_id: str) -> dict[str, Any] | None:
        async with self._conn() as db:
            cur = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = await cur.fetchone()
        return self._task_row(row) if row else None

    async def list_tasks(
        self,
        *,
        status: TaskStatus | None = None,
        assign_to: Side | ToSide | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        limit = max(1, min(limit, 200))
        clauses: list[str] = []
        params: list[Any] = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        if assign_to:
            clauses.append("assign_to = ?")
            params.append(assign_to)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM tasks {where} ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        async with self._conn() as db:
            cur = await db.execute(sql, params)
            rows = await cur.fetchall()
        return [self._task_row(r) for r in rows]

    async def update_task(
        self,
        *,
        task_id: str,
        status: TaskStatus,
        as_side: Side,
        result: str | None = None,
    ) -> dict[str, Any]:
        if status not in ("open", "in_progress", "done", "cancelled"):
            raise ValueError(f"Invalid status: {status}")
        now = _utc_now()
        async with self._conn() as db:
            if result is not None:
                cur = await db.execute(
                    """
                    UPDATE tasks
                    SET status = ?, result = ?, updated_by = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (status, result, as_side, now, task_id),
                )
            else:
                cur = await db.execute(
                    """
                    UPDATE tasks
                    SET status = ?, updated_by = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (status, as_side, now, task_id),
                )
            await db.commit()
            if cur.rowcount == 0:
                raise ValueError(f"Task not found: {task_id}")
        task = await self.get_task(task_id)
        assert task is not None
        return task

    async def bridge_status(self) -> dict[str, Any]:
        async with self._conn() as db:
            msg_total = (await (await db.execute("SELECT COUNT(*) AS c FROM messages")).fetchone())["c"]
            unread_claude = (
                await (
                    await db.execute(
                        """
                        SELECT COUNT(*) AS c FROM messages
                        WHERE read_by_claude = 0
                          AND (to_side IN ('claude', 'both'))
                          AND from_side != 'claude'
                        """
                    )
                ).fetchone()
            )["c"]
            unread_grok = (
                await (
                    await db.execute(
                        """
                        SELECT COUNT(*) AS c FROM messages
                        WHERE read_by_grok = 0
                          AND (to_side IN ('grok', 'both'))
                          AND from_side != 'grok'
                        """
                    )
                ).fetchone()
            )["c"]
            task_rows = await (
                await db.execute("SELECT status, COUNT(*) AS c FROM tasks GROUP BY status")
            ).fetchall()
        by_status = {r["status"]: r["c"] for r in task_rows}
        return {
            "ok": True,
            "message_count": msg_total,
            "unread": {"claude": unread_claude, "grok": unread_grok},
            "tasks_by_status": {
                "open": by_status.get("open", 0),
                "in_progress": by_status.get("in_progress", 0),
                "done": by_status.get("done", 0),
                "cancelled": by_status.get("cancelled", 0),
            },
        }

    @staticmethod
    def _message_row(row: aiosqlite.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "thread_id": row["thread_id"],
            "to": row["to_side"],
            "from": row["from_side"],
            "subject": row["subject"],
            "body": row["body"],
            "parent_id": row["parent_id"],
            "created_at": row["created_at"],
            "read_by": {
                "claude": bool(row["read_by_claude"]),
                "grok": bool(row["read_by_grok"]),
            },
        }

    @staticmethod
    def _task_row(row: aiosqlite.Row) -> dict[str, Any]:
        meta = row["metadata"]
        return {
            "id": row["id"],
            "title": row["title"],
            "brief": row["brief"],
            "assign_to": row["assign_to"],
            "status": row["status"],
            "result": row["result"],
            "metadata": json.loads(meta) if meta else None,
            "created_by": row["created_by"],
            "updated_by": row["updated_by"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
