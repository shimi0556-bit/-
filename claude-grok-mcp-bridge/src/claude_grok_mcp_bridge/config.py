"""Configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ALLOWED_REDIRECT_HOSTS: frozenset[str] = frozenset(
    {
        "claude.ai",
        "claude.com",
        "grok.com",
        "x.ai",
        "chatgpt.com",
        "openai.com",
        # Local development / Claude Code loopback
        "localhost",
        "127.0.0.1",
        "[::1]",
    }
)

DEFAULT_SCOPES = ["bridge"]


@dataclass(frozen=True)
class Settings:
    bridge_token: str
    host: str
    port: int
    public_url: str
    db_path: Path

    @property
    def issuer_url(self) -> str:
        return self.public_url.rstrip("/")

    @property
    def mcp_url(self) -> str:
        return f"{self.issuer_url}/mcp"


def get_settings() -> Settings:
    token = os.environ.get("BRIDGE_TOKEN", "").strip()
    if not token:
        # Allow empty only when explicitly testing; callers that need auth
        # should still set BRIDGE_TOKEN.
        token = os.environ.get("BRIDGE_TOKEN_OPTIONAL", "")

    host = os.environ.get("BRIDGE_HOST", "0.0.0.0")
    port = int(os.environ.get("BRIDGE_PORT", "8792"))
    public_url = os.environ.get("BRIDGE_PUBLIC_URL", f"http://127.0.0.1:{port}").rstrip("/")

    db_path = Path(os.environ.get("BRIDGE_DB_PATH", "data/bridge.db"))
    return Settings(
        bridge_token=token or "dev-token-change-me",
        host=host,
        port=port,
        public_url=public_url,
        db_path=db_path,
    )
