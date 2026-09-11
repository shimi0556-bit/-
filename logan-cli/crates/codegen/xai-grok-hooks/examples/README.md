# Hook Examples

Sample hooks for Grok. Copy to `~/.logan/hooks/` to enable globally, or to `<project>/.logan/hooks/` for project-scoped hooks (requires `/hooks-trust`).

## Available Examples

### 1. Safe Shell Guard (`safe-shell.json`)

**Type:** blocking (`PreToolUse`)

Denies obviously destructive shell commands before they execute:
- `rm -rf /`, `sudo rm -rf`, `mkfs`, `dd` to devices, fork bombs

**Install:**
```sh
mkdir -p ~/.logan/hooks/bin
cp examples/hooks/safe-shell.json ~/.logan/hooks/
cp examples/hooks/bin/safe-shell-guard.sh ~/.logan/hooks/bin/
chmod +x ~/.logan/hooks/bin/safe-shell-guard.sh
```

### 2. No Recursive Grep (`no-recursive-grep.json`)

**Type:** blocking (`PreToolUse`)

Denies recursive `grep` invocations in the shell before they execute:
- `grep -r`, `grep -R`, `grep --recursive`, `grep --dereference-recursive`,
  `grep -d recurse`, clustered flags (`grep -rn`, `grep -nri`), and `rgrep`

Recursive grep walks an entire directory tree into memory and can OOM-kill the
agent process on large repos. The system prompt already steers the model away from
this, but a prompt is advisory — this hook makes it a hard, deterministic block.
Point the model at the dedicated search tool (ripgrep-backed) instead.

It is careful to avoid false positives: `ls -R | grep foo` (the `-R` belongs to
`ls`), `grep -e -r file` (`-r` is the pattern), and `grep -- -r file` are all
allowed.

**Install:**
```sh
mkdir -p ~/.logan/hooks/bin
cp examples/hooks/no-recursive-grep.json ~/.logan/hooks/
cp examples/hooks/bin/no-recursive-grep-guard.py ~/.logan/hooks/bin/
chmod +x ~/.logan/hooks/bin/no-recursive-grep-guard.py
```
(Requires `python3` on `PATH`.)

### 3. Session Audit Log (`session-log.json`)

**Type:** passive (`SessionStart` + `SessionEnd`)

Appends session metadata to `~/.logan/session-audit.log` — event, session ID, cwd, timestamp.

**Install:**
```sh
mkdir -p ~/.logan/hooks/bin
cp examples/hooks/session-log.json ~/.logan/hooks/
cp examples/hooks/bin/session-log.sh ~/.logan/hooks/bin/
chmod +x ~/.logan/hooks/bin/session-log.sh
```

### 4. Tool Activity Logger (`tool-logger.json`)

**Type:** passive (`PreToolUse` + `PostToolUse`)

Logs all tool calls to `~/.logan/tool-activity.log` — tool name, event type, effective tool name, backgrounded status.

**Install:**
```sh
mkdir -p ~/.logan/hooks/bin
cp examples/hooks/tool-logger.json ~/.logan/hooks/
cp examples/hooks/bin/tool-logger.sh ~/.logan/hooks/bin/
chmod +x ~/.logan/hooks/bin/tool-logger.sh
```

## Format

Hook files use the Claude-compatible JSON format:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bin/check.sh", "timeout": 5 }
        ]
      }
    ]
  }
}
```

- **Event names:** `SessionStart`, `PreToolUse`, `PostToolUse`, `SessionEnd`
- **Matcher:** regex on tool name. Claude names like `Bash`, `Read`, `Edit` are auto-expanded to also match Grok names (`run_terminal_cmd`, `read_file`, `search_replace`)
- **Timeout:** in seconds (default: 5)
- **Command:** path to script (relative to hook file directory) or inline shell command

## Script Contract

Scripts receive the hook event envelope as JSON on **stdin** and should write a response to **stdout**:

**For blocking hooks (`PreToolUse`):**
```json
{"decision":"allow"}
```
or
```json
{"decision":"deny","reason":"Explanation for the user"}
```

**Exit codes:** `0` = allow, `2` = deny, other = fail-open.

**For passive hooks:** stdout is informational only. Exit `0` for success.

## Uninstall

Remove the JSON file from `~/.logan/hooks/`. The hook stops running on the next session.
### 5. Auto Reflect (`auto-reflect`) - Logan

**Type:** passive (`Stop` + `SessionEnd`)

Shipped under repo `examples/hooks/` (not only this crate examples tree).
Appends reflection stubs to `~/.logan/memory/MEMORY.md` and
`~/.logan/memory/reflections.log` for Hermes-style durable learning.

```sh
mkdir -p ~/.logan/hooks/bin
cp examples/hooks/auto-reflect.json ~/.logan/hooks/
cp examples/hooks/bin/auto-reflect.py ~/.logan/hooks/bin/
chmod +x ~/.logan/hooks/bin/auto-reflect.py
```
