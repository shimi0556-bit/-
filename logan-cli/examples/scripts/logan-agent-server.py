#!/usr/bin/env python3
"""Hardened HTTP remote agent wrapper around Logan headless.

Author: Yuval Avidani (YUV.AI) - https://yuv.ai

Features:
  - Auth: Bearer LOGAN_AGENT_TOKEN (required if env set; recommended always)
  - Quotas: max concurrent, per-IP rate limit, max_turns cap, wall timeout
  - Bind default 127.0.0.1 only
  - Usage ledger append to ~/.logan/stats/usage.jsonl

  LOGAN_AGENT_TOKEN=secret python3 examples/scripts/logan-agent-server.py --port 8787

  curl -s localhost:8787/v1/run \\
    -H "Authorization: Bearer secret" \\
    -H 'content-type: application/json' \\
    -d '{"prompt":"List top 3 TODOs","cwd":"/path/to/repo","model":"tier-default"}'
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


class Quota:
    def __init__(self, max_concurrent: int, rate_per_min: int, max_turns: int, timeout_secs: int):
        self.max_concurrent = max_concurrent
        self.rate_per_min = rate_per_min
        self.max_turns = max_turns
        self.timeout_secs = timeout_secs
        self._sem = threading.Semaphore(max_concurrent)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, ip: str) -> tuple[bool, str]:
        now = time.time()
        with self._lock:
            q = self._hits[ip]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.rate_per_min:
                return False, f"rate limit: max {self.rate_per_min}/min"
            if not self._sem.acquire(blocking=False):
                return False, f"busy: max concurrent {self.max_concurrent}"
            q.append(now)
            return True, ""

    def release(self) -> None:
        self._sem.release()


QUOTA: Quota | None = None


def run_logan(body: dict) -> dict:
    assert QUOTA is not None
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        return {"ok": False, "error": "prompt required"}

    model = body.get("model") or body.get("route") or os.environ.get("MODEL", "tier-default")
    route = body.get("route")  # "auto" or tier id; optional
    cwd = body.get("cwd") or os.getcwd()
    max_turns = min(int(body.get("max_turns") or QUOTA.max_turns), QUOTA.max_turns)
    always = body.get("always_approve", True)
    logan = os.environ.get("LOGAN_BIN", "logan")
    timeout = min(int(body.get("timeout_secs") or QUOTA.timeout_secs), QUOTA.timeout_secs)

    cmd = [
        logan,
        "-p",
        prompt,
        "--cwd",
        str(cwd),
        "--output-format",
        "json",
        "--max-turns",
        str(max_turns),
    ]
    # Prefer explicit model; else --route auto/tier
    if body.get("model"):
        cmd.extend(["-m", str(model)])
    elif route:
        cmd.extend(["--route", str(route)])
    else:
        cmd.extend(["-m", str(model)])
    if always:
        cmd.append("--always-approve")

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "timeout", "timeout_secs": timeout, "model": model, "cwd": cwd}
    except FileNotFoundError:
        return {"ok": False, "error": f"logan binary not found: {logan}"}

    usage = None
    text = proc.stdout
    try:
        data = json.loads(proc.stdout)
        if isinstance(data, dict):
            usage = data.get("usage")
            text = (
                data.get("result")
                or data.get("text")
                or data.get("data")
                or proc.stdout
            )
    except json.JSONDecodeError:
        pass

    stats = Path(os.environ.get("LOGAN_HOME", Path.home() / ".logan")) / "stats"
    stats.mkdir(parents=True, exist_ok=True)
    rec = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": model,
        "route": route,
        "cwd": cwd,
        "exit_code": proc.returncode,
        "usage": usage,
        "chars_out": len(proc.stdout or ""),
    }
    with (stats / "usage.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")

    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "model": model,
        "cwd": cwd,
        "text": text,
        "usage": usage,
        "stderr": (proc.stderr or "")[-4000:],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "LoganAgent/0.2"

    def _client_ip(self) -> str:
        return self.client_address[0]

    def _auth_ok(self) -> bool:
        token = os.environ.get("LOGAN_AGENT_TOKEN")
        if not token:
            # Fail closed if --require-auth was used (env REQUIRED)
            if os.environ.get("LOGAN_AGENT_REQUIRE_AUTH") == "1":
                return False
            return True
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {token}"

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in ("/health", "/v1/health"):
            self._json(
                200,
                {
                    "ok": True,
                    "service": "logan-agent",
                    "auth_required": bool(os.environ.get("LOGAN_AGENT_TOKEN"))
                    or os.environ.get("LOGAN_AGENT_REQUIRE_AUTH") == "1",
                },
            )
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        assert QUOTA is not None
        if not self._auth_ok():
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        path = urlparse(self.path).path
        if path not in ("/v1/run", "/run"):
            self._json(404, {"ok": False, "error": "not found"})
            return
        ok, reason = QUOTA.allow(self._client_ip())
        if not ok:
            self._json(429, {"ok": False, "error": reason})
            return
        try:
            n = int(self.headers.get("content-length") or 0)
            if n > 256_000:
                self._json(413, {"ok": False, "error": "body too large"})
                return
            try:
                body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            except json.JSONDecodeError:
                self._json(400, {"ok": False, "error": "invalid json"})
                return
            result = run_logan(body)
            self._json(200 if result.get("ok") else 500, result)
        finally:
            QUOTA.release()

    def log_message(self, fmt: str, *args) -> None:
        import sys

        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    global QUOTA
    ap = argparse.ArgumentParser(description="Logan remote agent HTTP wrapper (hardened)")
    ap.add_argument("--host", default="127.0.0.1", help="bind address (default localhost)")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--max-concurrent", type=int, default=2)
    ap.add_argument("--rate-per-min", type=int, default=20)
    ap.add_argument("--max-turns", type=int, default=40)
    ap.add_argument("--timeout-secs", type=int, default=600)
    ap.add_argument(
        "--require-auth",
        action="store_true",
        help="reject requests if LOGAN_AGENT_TOKEN is unset",
    )
    args = ap.parse_args()
    if args.require_auth:
        os.environ["LOGAN_AGENT_REQUIRE_AUTH"] = "1"
        if not os.environ.get("LOGAN_AGENT_TOKEN"):
            raise SystemExit("LOGAN_AGENT_TOKEN required with --require-auth")

    QUOTA = Quota(args.max_concurrent, args.rate_per_min, args.max_turns, args.timeout_secs)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"logan-agent listening on http://{args.host}:{args.port}", flush=True)
    print(
        f"quotas: concurrent={args.max_concurrent} rate={args.rate_per_min}/min "
        f"max_turns={args.max_turns} timeout={args.timeout_secs}s",
        flush=True,
    )
    print("POST /v1/run  GET /health", flush=True)
    if os.environ.get("LOGAN_AGENT_TOKEN") or args.require_auth:
        print("auth: Bearer LOGAN_AGENT_TOKEN required", flush=True)
    else:
        print("WARNING: no LOGAN_AGENT_TOKEN — local use only", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
