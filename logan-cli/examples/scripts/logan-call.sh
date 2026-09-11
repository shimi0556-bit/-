#!/usr/bin/env bash
# Call Logan headless as a tool for another agent / CI.
# Author: Yuval Avidani (YUV.AI) - https://yuv.ai
#
# Usage:
#   examples/scripts/logan-call.sh "Add unit tests for foo"
#   MODEL=tier-fast examples/scripts/logan-call.sh "What does main.rs do?"
#   CWD=/path/to/repo examples/scripts/logan-call.sh "Run tests and fix failures"

set -euo pipefail

PROMPT="${1:-}"
if [[ -z "$PROMPT" ]]; then
  echo "usage: $0 \"<prompt>\"" >&2
  exit 2
fi

MODEL="${MODEL:-tier-default}"
CWD="${CWD:-$(pwd)}"
MAX_TURNS="${MAX_TURNS:-40}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-json}"
STATS_DIR="${LOGAN_HOME:-$HOME/.logan}/stats"
mkdir -p "$STATS_DIR"

LOGAN_BIN="${LOGAN_BIN:-logan}"
if ! command -v "$LOGAN_BIN" >/dev/null 2>&1; then
  echo "logan not on PATH (set LOGAN_BIN=...)" >&2
  exit 127
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUT_FILE="$(mktemp)"
trap 'rm -f "$OUT_FILE"' EXIT

set +e
"$LOGAN_BIN" -p "$PROMPT" \
  --cwd "$CWD" \
  -m "$MODEL" \
  --output-format "$OUTPUT_FORMAT" \
  --always-approve \
  --max-turns "$MAX_TURNS" \
  >"$OUT_FILE" 2>"$STATS_DIR/last-stderr.log"
EC=$?
set -e

# Append a stats line for rollup (best-effort parse)
python3 - "$OUT_FILE" "$STATS_DIR/usage.jsonl" "$TS" "$MODEL" "$CWD" "$EC" <<'PY'
import json, sys, pathlib
out_path, ledger, ts, model, cwd, ec = sys.argv[1:7]
raw = pathlib.Path(out_path).read_text(encoding="utf-8", errors="replace")
usage = None
text = raw
try:
    data = json.loads(raw)
    if isinstance(data, dict):
        usage = data.get("usage") or data.get("result", {}).get("usage")
        text = data.get("result") or data.get("text") or data.get("data") or raw
except Exception:
    pass
rec = {
    "ts": ts,
    "model": model,
    "cwd": cwd,
    "exit_code": int(ec),
    "usage": usage,
    "chars_out": len(raw),
}
pathlib.Path(ledger).parent.mkdir(parents=True, exist_ok=True)
with open(ledger, "a", encoding="utf-8") as f:
    f.write(json.dumps(rec) + "\n")
# print agent-facing payload to stdout
sys.stdout.write(raw if raw.endswith("\n") else raw + "\n")
sys.exit(int(ec))
PY
