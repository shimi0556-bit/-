#!/usr/bin/env bash
# Dump the latest Logan session's system prompt + sizes for learning.
# Author: Yuval Avidani (YUV.AI)
set -euo pipefail
HOME_LOGAN="${LOGAN_HOME:-$HOME/.logan}"
SESS="$HOME_LOGAN/sessions"
if [[ ! -d "$SESS" ]]; then
  echo "No sessions dir at $SESS"
  exit 1
fi
# newest system_prompt.txt
LATEST=$(find "$SESS" -name system_prompt.txt -type f 2>/dev/null | xargs ls -t 2>/dev/null | head -1 || true)
if [[ -z "${LATEST:-}" ]]; then
  echo "No system_prompt.txt found under $SESS"
  echo "Run a logan session first, then re-run this script."
  exit 1
fi
DIR=$(dirname "$LATEST")
echo "=== Session dir ==="
echo "$DIR"
echo
echo "=== system_prompt.txt (first 60 lines) ==="
head -60 "$LATEST"
echo "…"
CHARS=$(wc -c <"$LATEST" | tr -d ' ')
LINES=$(wc -l <"$LATEST" | tr -d ' ')
# rough token estimate chars/4
TOK=$((CHARS / 4))
echo
echo "=== Sizes ==="
echo "system_prompt.txt: $CHARS chars · $LINES lines · ~$TOK tokens (chars/4)"
if [[ -f "$DIR/prompt_context.json" ]]; then
  echo "prompt_context.json: $(wc -c <"$DIR/prompt_context.json" | tr -d ' ') bytes"
fi
if [[ -f "$DIR/chat_history.jsonl" ]]; then
  echo "chat_history.jsonl: $(wc -l <"$DIR/chat_history.jsonl" | tr -d ' ') lines · $(wc -c <"$DIR/chat_history.jsonl" | tr -d ' ') bytes"
fi
echo
echo "Tip: open full file:  less \"$LATEST\""
echo "Tip: in TUI use /context and /stats for live breakdowns"
