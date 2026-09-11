#!/usr/bin/env python3
"""Roll up ~/.logan/stats/usage.jsonl into a human table.

  python3 examples/scripts/usage-rollup.py
  python3 examples/scripts/usage-rollup.py --by-model
"""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--by-model", action="store_true")
    ap.add_argument(
        "--path",
        default=str(Path(os.environ.get("LOGAN_HOME", Path.home() / ".logan")) / "stats" / "usage.jsonl"),
    )
    args = ap.parse_args()
    path = Path(args.path)
    if not path.exists():
        print(f"no ledger yet: {path}")
        print("run examples/scripts/logan-call.sh or the agent server first")
        return

    totals = defaultdict(lambda: {"calls": 0, "input": 0, "output": 0, "cache_read": 0, "chars": 0})
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        key = rec.get("model") if args.by_model else "all"
        t = totals[key]
        t["calls"] += 1
        t["chars"] += int(rec.get("chars_out") or 0)
        u = rec.get("usage") or {}
        if isinstance(u, dict):
            t["input"] += int(u.get("input_tokens") or u.get("prompt_tokens") or 0)
            t["output"] += int(u.get("output_tokens") or u.get("completion_tokens") or 0)
            t["cache_read"] += int(
                u.get("cache_read_tokens")
                or u.get("cache_read_input_tokens")
                or u.get("cached_prompt_tokens")
                or 0
            )

    print(f"{'model':<24} {'calls':>6} {'input':>10} {'output':>10} {'cache_rd':>10}")
    print("-" * 64)
    for k, t in sorted(totals.items(), key=lambda kv: -kv[1]["calls"]):
        print(
            f"{k:<24} {t['calls']:>6} {t['input']:>10} {t['output']:>10} {t['cache_read']:>10}"
        )


if __name__ == "__main__":
    main()
