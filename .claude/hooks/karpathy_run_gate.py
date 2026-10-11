#!/usr/bin/env python3
"""Karpathy run gate: "run it before you say it works".

Wired in .claude/settings.json for two events:

- SubagentStop (matcher ^karpathy$): reads the karpathy subagent's own
  transcript (agent_transcript_path).
- Stop: reads the main transcript, but only acts when the current turn used
  the karpathy-teach skill or delegated to the karpathy subagent. Every other
  session is left alone.

Blocks (decision=block) when a code file was written/edited and no command
was run after the last such edit. Read-only shell commands (cat, ls, grep...)
don't count as running it.
"""
import json
import re
import sys

CODE_EXT = re.compile(
    r"\.(py|ipynb|js|mjs|cjs|ts|tsx|jsx|c|h|cc|cpp|hpp|cu|rs|go|java|kt|rb|php|sh|bash|zsh|lua|swift|r|jl|sql)$",
    re.I,
)
READ_ONLY = re.compile(
    r"^\s*(cat|less|head|tail|ls|tree|grep|rg|find|wc|file|stat|pwd|echo|which|sed\s+-n|git\s+(status|diff|log|show))\b"
)
EDIT_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
# Code written from the shell (`cat > x.py <<EOF`, `tee x.py`) counts as an edit.
SHELL_WRITE = re.compile(r"(?:>>?|\btee\s+(?:-a\s+)?)\s*['\"]?([^\s'\";|&<>]+)")
HEREDOC = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?.*?\n.*?\n\1\s*(?:\n|$)", re.S)
MESSAGE = "Karpathy rule, run it before you say it works."


def load(path):
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    return rows


def is_real_user_turn(row):
    if row.get("type") != "user" or row.get("isMeta"):
        return False
    content = (row.get("message") or {}).get("content")
    if isinstance(content, str):
        return True
    return isinstance(content, list) and not any(
        isinstance(b, dict) and b.get("type") == "tool_result" for b in content
    )


def tool_uses(rows):
    for row in rows:
        if row.get("type") != "assistant":
            continue
        for block in (row.get("message") or {}).get("content") or []:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                yield block.get("name"), block.get("input") or {}


def edited_without_run(rows):
    pending = None  # last code file edited since the last run
    for name, inp in tool_uses(rows):
        if name in EDIT_TOOLS:
            path = inp.get("file_path") or inp.get("notebook_path") or ""
            if CODE_EXT.search(path):
                pending = path
        elif name == "Bash":
            cmd = inp.get("command", "")
            # Drop heredoc bodies, then split into statements: a statement that
            # writes a code file is an edit, anything else non-read-only is a run.
            for stmt in re.split(r"&&|\|\||;|\n", HEREDOC.sub("\n", cmd)):
                written = [p for p in SHELL_WRITE.findall(stmt) if CODE_EXT.search(p)]
                if written:
                    pending = written[-1]
                elif stmt.strip() and not READ_ONLY.match(stmt) and not re.match(r"^\s*(cd|mkdir|rm|export)\b", stmt):
                    pending = None
    return pending


def used_karpathy(rows):
    for name, inp in tool_uses(rows):
        if name == "Skill" and str(inp.get("skill", "")).split(":")[-1] == "karpathy-teach":
            return True
        if name in ("Agent", "Task") and inp.get("subagent_type") == "karpathy":
            return True
    return False


def main():
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return
    if event.get("stop_hook_active"):
        # Already sent back once; don't loop forever on a condition it can't meet.
        return

    if event.get("hook_event_name") == "SubagentStop":
        if event.get("agent_type") != "karpathy":
            return
        rows = load(event.get("agent_transcript_path") or "")
    else:
        rows = load(event.get("transcript_path") or "")
        # Only the current turn: everything after the last real user message.
        for i in range(len(rows) - 1, -1, -1):
            if is_real_user_turn(rows[i]):
                rows = rows[i + 1:]
                break
        if not used_karpathy(rows):
            return

    path = edited_without_run(rows)
    if path:
        print(json.dumps({"decision": "block", "reason": f"{MESSAGE} ({path} was edited after the last run.)"}))


if __name__ == "__main__":
    main()
