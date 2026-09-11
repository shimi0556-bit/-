#!/usr/bin/env python3
"""Logan retro-insight hook - real retrospective data, not stubs.

Wired via retrospective.json to:
  PostToolUseFailure  -> record what tool failed and how
  PermissionDenied    -> record UX friction (denied tool calls)
  StopFailure         -> record API/turn-level errors
  SessionEnd          -> aggregate the session's failures into a structured
                         IMPROVEMENTS.md entry Logan must root-cause next
                         session (self-improve skill closes the loop)

Envelope arrives on stdin as camelCase JSON (see xai-grok-hooks event.rs);
event names are snake_case. Stdlib only; safe on Windows (Logan forces
PYTHONUTF8=1 for hook children).

Author: Yuval Avidani (YUV.AI) - https://yuv.ai
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

FAILURE_EVENTS = {"post_tool_use_failure", "permission_denied", "stop_failure"}
MAX_JOURNAL = 200_000


def logan_home() -> Path:
    env = os.environ.get("LOGAN_HOME") or os.environ.get("GROK_HOME")
    return Path(env).expanduser() if env else Path.home() / ".logan"


def input_digest(tool_input) -> str:
    """One-line, privacy-light summary of what the tool was asked to do."""
    if not isinstance(tool_input, dict):
        return ""
    for key in ("command", "file_path", "path", "url", "pattern", "prompt"):
        val = tool_input.get(key)
        if isinstance(val, str) and val.strip():
            return f"{key}={val.strip()[:160]}"
    return "keys=" + ",".join(sorted(tool_input.keys())[:8])


def append_capped(path: Path, block: str, header: str) -> None:
    if path.exists():
        text = path.read_text(encoding="utf-8", errors="replace")
    else:
        text = header
    if len(text) > MAX_JOURNAL:
        text = text[: MAX_JOURNAL - 20_000] + "\n\n<!-- truncated by retro-insight -->\n"
    path.write_text(text.rstrip() + "\n" + block, encoding="utf-8")


def main() -> int:
    raw = sys.stdin.read()
    try:
        ev = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        ev = {}

    event = ev.get("hookEventName") or ev.get("hook_event_name") or "unknown"
    sid = ev.get("sessionId") or ev.get("session_id") or "unknown-session"
    sid8 = str(sid).replace("-", "")[:8]
    cwd = ev.get("cwd") or os.getcwd()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    mem = logan_home() / "memory"
    retro = mem / "retro"
    retro.mkdir(parents=True, exist_ok=True)
    session_file = retro / f"{sid8}.jsonl"

    tool = ev.get("toolName") or ""
    error = (ev.get("error") or "")[:400]

    # Operator firehose - one line per event, always.
    summary = f"tool={tool} " if tool else ""
    if error:
        summary += f"err={error[:120]!r}"
    with (mem / "reflections.log").open("a", encoding="utf-8") as f:
        f.write(f"{ts}\tevent={event}\tsession={sid8}\t{summary}\tcwd={cwd}\n")

    # Failure events: record structured evidence for the session retrospective.
    if event in FAILURE_EVENTS:
        record = {
            "ts": ts,
            "event": event,
            "tool": tool,
            "error": error,
            "input": input_digest(ev.get("toolInput")),
        }
        with session_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return 0

    if event != "session_end":
        return 0

    # ── Session retrospective ────────────────────────────────────────────
    reason = ev.get("reason") or "?"
    turns = ev.get("turnCount")
    tools_n = ev.get("toolCallCount")

    records: list[dict] = []
    if session_file.exists():
        for line in session_file.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        session_file.unlink(missing_ok=True)

    if not records:
        return 0  # clean session: firehose line above is enough, no journal noise

    # Group failures by (event, tool) with count + first error sample.
    groups: dict[tuple[str, str], dict] = {}
    for r in records:
        key = (r.get("event", "?"), r.get("tool") or "-")
        g = groups.setdefault(key, {"count": 0, "first": r})
        g["count"] += 1

    lines = [
        f"\n### {ts} · session retrospective `{sid8}`",
        f"- **Trigger:** session_end reason=`{reason}` turns={turns} tool_calls={tools_n} cwd=`{cwd}`",
        f"- **Failures observed:** {len(records)} across {len(groups)} class(es):",
    ]
    for (ev_name, tool_name), g in sorted(groups.items(), key=lambda kv: -kv[1]["count"]):
        first = g["first"]
        detail = first.get("error") or first.get("input") or ""
        lines.append(
            f"  - `{ev_name}` · `{tool_name}` × {g['count']} - first: {detail[:200]!r}"
        )
    lines += [
        "- **Decision:** (Logan: root-cause each class above at next session start - not symptom patches)",
        "- **Lesson for next time:** (Logan: REPLACE this line with the durable rule once root-caused; see self-improve skill)",
    ]

    append_capped(
        mem / "IMPROVEMENTS.md",
        "\n".join(lines) + "\n",
        "# IMPROVEMENTS\n\nStructured self-heal / self-improve journal.\n",
    )

    # Terminal notification (OSC 9 / OSC 777 where supported).
    try:
        body = f"{len(records)} failure(s) journaled - /improve to review"
        sys.stderr.write(f"\033]9;Logan retrospective: {body}\033\\")
        sys.stderr.flush()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
