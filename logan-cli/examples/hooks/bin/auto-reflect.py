#!/usr/bin/env python3
"""Logan auto-reflect hook (Stop + SessionEnd).

Appends a short reflection stub so long-term memory can learn what sessions
did. Hermes-style durable learning without weight training.

Also maintains IMPROVEMENTS.md stubs for /improve visibility.

Author: Yuval Avidani (YUV.AI) - https://yuv.ai
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def logan_home() -> Path:
    env = os.environ.get("LOGAN_HOME") or os.environ.get("GROK_HOME")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".logan"


def main() -> int:
    raw = sys.stdin.read()
    event: dict = {}
    if raw.strip():
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            event = {"raw": raw[:2000]}

    home = logan_home()
    mem_dir = home / "memory"
    mem_dir.mkdir(parents=True, exist_ok=True)

    event_name = (
        event.get("hook_event_name")
        or event.get("event")
        or event.get("type")
        or "unknown"
    )
    session_id = (
        event.get("session_id")
        or event.get("sessionId")
        or (event.get("session") or {}).get("id")
        or "unknown-session"
    )
    cwd = event.get("cwd") or event.get("working_directory") or os.getcwd()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # Compact one-line log for operators
    log_path = mem_dir / "reflections.log"
    line = f"{ts}\tevent={event_name}\tsession={session_id}\tcwd={cwd}\n"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line)

    # Durable markdown for memory_search / humans
    memory_md = mem_dir / "MEMORY.md"
    if not memory_md.exists():
        memory_md.write_text(
            "# Logan Memory\n\n## Preferences\n\n## Lessons\n\n## Auto reflections\n",
            encoding="utf-8",
        )

    block = (
        f"\n### {ts} · {event_name}\n"
        f"- session: `{session_id}`\n"
        f"- cwd: `{cwd}`\n"
        f"- note: auto-reflect hook fired. Run `/improve` for dashboard, "
        f"`/improve why` for decision path, `/flush` for rich LLM summary.\n"
    )

    text = memory_md.read_text(encoding="utf-8")
    if "## Auto reflections" not in text:
        text = text.rstrip() + "\n\n## Auto reflections\n"
    if len(text) > 200_000:
        text = text[:180_000] + "\n\n<!-- truncated by auto-reflect.py -->\n"
    memory_md.write_text(text.rstrip() + "\n" + block, encoding="utf-8")

    # Structured improve journal stub (visibility for /improve)
    improvements = mem_dir / "IMPROVEMENTS.md"
    if not improvements.exists():
        improvements.write_text(
            "# IMPROVEMENTS\n\nStructured self-heal / self-improve journal.\n\n",
            encoding="utf-8",
        )
    imp_block = (
        f"\n### {ts} · hook:{event_name}\n"
        f"- **Trigger:** session lifecycle `{event_name}`\n"
        f"- **Analyzed:** session `{session_id}` · cwd `{cwd}`\n"
        f"- **Decision:** stub only - agent should fill after real fixes\n"
        f"- **Changed:** (pending)\n"
        f"- **Improved how:** (pending)\n"
        f"- **Lesson for next time:** run `/improve why` after hard tasks\n"
    )
    imp_text = improvements.read_text(encoding="utf-8")
    if len(imp_text) > 200_000:
        imp_text = imp_text[:180_000] + "\n\n<!-- truncated -->\n"
    improvements.write_text(imp_text.rstrip() + "\n" + imp_block, encoding="utf-8")

    # Desktop / terminal notification
    title = "Logan learned"
    body = f"Reflection saved ({event_name}). /improve · MEMORY.md"
    try:
        sys.stderr.write(f"\033]9;{title}: {body}\033\\")
        sys.stderr.write(f"\033]777;notify;{title};{body}\033\\")
        sys.stderr.flush()
    except Exception:
        pass
    if sys.platform == "darwin":
        try:
            import subprocess

            safe_body = body.replace('"', "'")
            subprocess.run(
                [
                    "osascript",
                    "-e",
                    f'display notification "{safe_body}" with title "{title}"',
                ],
                check=False,
                capture_output=True,
            )
        except Exception:
            pass

    # Hook protocol: empty JSON object is fine
    print("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
