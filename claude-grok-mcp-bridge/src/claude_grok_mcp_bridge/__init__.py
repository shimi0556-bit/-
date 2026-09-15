"""Claude ↔ Grok bidirectional MCP bridge."""

from __future__ import annotations

import argparse
import sys

__version__ = "0.1.0"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="claude-grok-mcp-bridge",
        description="Bidirectional MCP bridge mailbox/task board for Claude and Grok",
    )
    parser.add_argument(
        "mode",
        nargs="?",
        default="http",
        choices=("http", "stdio"),
        help="Transport: http (Streamable HTTP + OAuth) or stdio (Claude Code)",
    )
    args = parser.parse_args(argv)

    from .config import get_settings
    from .server import run_http, run_stdio

    settings = get_settings()
    if args.mode == "stdio":
        run_stdio(settings)
    else:
        print(
            f"Starting Claude↔Grok MCP bridge on {settings.host}:{settings.port} "
            f"(public={settings.public_url})",
            file=sys.stderr,
        )
        run_http(settings)


__all__ = ["__version__", "main"]
