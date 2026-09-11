#!/usr/bin/env bash
# Simple feature check: Logan vs Grok Build (if installed)
# Author: Yuval Avidani (YUV.AI)
set -euo pipefail
export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"

have() { command -v "$1" >/dev/null 2>&1; }
ok() { printf "  OK   %s\n" "$1"; }
miss() { printf "  MISS %s\n" "$1"; }
# Prefer raw binary scan (macOS `strings` drops some UTF-8 markers).
check_string() {
  local bin=$1 needle=$2
  if python3 -c "import sys; sys.exit(0 if sys.argv[2].encode() in open(sys.argv[1],'rb').read() else 1)" "$bin" "$needle"; then
    ok "$needle"
  else
    miss "$needle"
  fi
}

echo "Logan feature check"
echo "date: $(date -u +%Y-%m-%dT%H:%MZ)"
echo

if ! have logan; then
  echo "ERROR: logan not on PATH. Run: bash scripts/install-logan.sh"
  exit 1
fi

LOGAN_BIN=$(command -v logan)
echo "logan: $($LOGAN_BIN --version 2>&1 | head -1)"
echo "path:  $LOGAN_BIN"
echo
echo "Logan feature strings"
for s in "/stats" "Token stats" "context deep" "Deep dive" "/goal" "Yuval" "Logan by"; do
  check_string "$LOGAN_BIN" "$s"
done

echo
echo "Headless smoke (logan)"
t0=$(python3 -c 'import time; print(time.time())')
out=$(logan -p "Reply with exactly: logan-ok" --always-approve --no-leader 2>&1 || true)
t1=$(python3 -c 'import time; print(time.time())')
if echo "$out" | rg -q "logan-ok"; then
  ok "headless reply logan-ok ($(python3 -c "print(round($t1-$t0,2))")s)"
else
  miss "headless reply (got: $(echo "$out" | tail -3 | tr '\n' ' '))"
fi

if have grok; then
  GROK_BIN=$(command -v grok)
  echo
  echo "grok:  $($GROK_BIN --version 2>&1 | head -1)"
  echo "path:  $GROK_BIN"
  echo
  echo "Grok feature strings (for comparison)"
  for s in "/stats" "Token stats" "context deep" "Deep dive" "/goal" "Yuval" "Logan by"; do
    check_string "$GROK_BIN" "$s"
  done
  echo
  echo "Headless smoke (grok)"
  t0=$(python3 -c 'import time; print(time.time())')
  gout=$(grok -p "Reply with exactly: grok-ok" --always-approve --no-leader 2>&1 || true)
  t1=$(python3 -c 'import time; print(time.time())')
  if echo "$gout" | rg -q "grok-ok"; then
    ok "headless reply grok-ok ($(python3 -c "print(round($t1-$t0,2))")s)"
  else
    miss "headless reply (got: $(echo "$gout" | tail -3 | tr '\n' ' '))"
  fi
else
  echo
  echo "(grok not installed - skip comparison)"
fi

echo
echo "Session files (deep dive needs these after a turn)"
n_sys=$(find "${LOGAN_HOME:-$HOME/.logan}/sessions" -name system_prompt.txt 2>/dev/null | wc -l | tr -d ' ')
n_hist=$(find "${LOGAN_HOME:-$HOME/.logan}/sessions" -name chat_history.jsonl 2>/dev/null | wc -l | tr -d ' ')
echo "  system_prompt.txt: $n_sys"
echo "  chat_history.jsonl: $n_hist"
echo
echo "Done. Full write-up: docs/BENCHMARK.md"
