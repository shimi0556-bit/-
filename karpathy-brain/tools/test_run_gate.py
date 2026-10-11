#!/usr/bin/env python3
"""Tests for .claude/hooks/karpathy_run_gate.py on synthetic transcripts.

    python3 karpathy-brain/tools/test_run_gate.py
"""
import json
import pathlib
import subprocess
import sys
import tempfile

HOOK = pathlib.Path(__file__).resolve().parents[2] / ".claude/hooks/karpathy_run_gate.py"


def a(name, inp):
    return {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": name, "input": inp}]}}


def u(text):
    return {"type": "user", "message": {"content": text}}


TEACH = a("Skill", {"skill": "karpathy-teach"})
# (event, agent_type, rows, should_block)
CASES = {
    "write, no run": ("SubagentStop", "karpathy", [u("go"), a("Write", {"file_path": "bpe.py"})], True),
    "write, then run": ("SubagentStop", "karpathy", [u("go"), a("Write", {"file_path": "bpe.py"}), a("Bash", {"command": "python3 bpe.py"})], False),
    "write, then only cat": ("SubagentStop", "karpathy", [u("go"), a("Write", {"file_path": "bpe.py"}), a("Bash", {"command": "cat bpe.py"})], True),
    "write, then only mkdir": ("SubagentStop", "karpathy", [u("go"), a("Write", {"file_path": "x.py"}), a("Bash", {"command": "mkdir -p out"})], True),
    "markdown only": ("SubagentStop", "karpathy", [u("go"), a("Write", {"file_path": "notes.md"})], False),
    "heredoc, no run": ("SubagentStop", "karpathy", [u("go"), a("Bash", {"command": "cd d && cat > x.py <<'EOF'\nprint('python3')\nEOF"})], True),
    "heredoc + run, same call": ("SubagentStop", "karpathy", [u("go"), a("Bash", {"command": "cat > x.py <<'EOF'\nprint(1)\nEOF\npython3 x.py"})], False),
    "heredoc, run next call": ("SubagentStop", "karpathy", [u("go"), a("Bash", {"command": "cat > x.py <<'EOF'\nprint(1)\nEOF"}), a("Bash", {"command": "python3 x.py"})], False),
    "tee, no run": ("SubagentStop", "karpathy", [u("go"), a("Bash", {"command": "echo 'x=1' | tee x.py"})], True),
    "run redirected to txt": ("SubagentStop", "karpathy", [u("go"), a("Write", {"file_path": "x.py"}), a("Bash", {"command": "python3 x.py > out.txt"})], False),
    "other subagent ignored": ("SubagentStop", "Explore", [u("go"), a("Write", {"file_path": "x.py"})], False),
    "main turn used teach, edit, no run": ("Stop", None, [u("old"), a("Write", {"file_path": "x.py"}), u("/karpathy-teach"), TEACH, a("Edit", {"file_path": "y.py"})], True),
    "main session without karpathy": ("Stop", None, [u("hi"), a("Write", {"file_path": "x.py"})], False),
    "teach was in an earlier turn": ("Stop", None, [u("/karpathy-teach"), TEACH, a("Write", {"file_path": "x.py"}), u("thanks"), a("Write", {"file_path": "z.py"})], False),
}


def run(event, agent_type, rows, stop_hook_active=False):
    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
        f.write("\n".join(json.dumps(r) for r in rows))
    payload = {"hook_event_name": event, "stop_hook_active": stop_hook_active}
    if event == "SubagentStop":
        payload.update(agent_type=agent_type, agent_transcript_path=f.name)
    else:
        payload["transcript_path"] = f.name
    out = subprocess.run([sys.executable, str(HOOK)], input=json.dumps(payload), capture_output=True, text=True).stdout
    return bool(out.strip() and json.loads(out).get("decision") == "block")


def main():
    fails = 0
    for name, (event, agent, rows, want) in CASES.items():
        got = run(event, agent, rows)
        fails += got != want
        print(f"{'ok  ' if got == want else 'FAIL'} {name}: expected {'block' if want else 'allow'}, got {'block' if got else 'allow'}")
    looped = run("SubagentStop", "karpathy", CASES["write, no run"][2], stop_hook_active=True)
    fails += looped
    print(f"{'FAIL' if looped else 'ok  '} loop guard: stop_hook_active=true is allowed")
    print("OK" if not fails else f"{fails} failure(s)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
