from __future__ import annotations

import os
from pathlib import Path

import pytest

# Ensure predictable env for all tests before importing the package settings.
os.environ["BRIDGE_TOKEN"] = "test-bridge-token"
os.environ["BRIDGE_HOST"] = "127.0.0.1"
os.environ["BRIDGE_PORT"] = "8792"
os.environ["BRIDGE_PUBLIC_URL"] = "http://127.0.0.1:8792"


@pytest.fixture
def settings(tmp_path: Path):
    from claude_grok_mcp_bridge.config import Settings

    return Settings(
        bridge_token="test-bridge-token",
        host="127.0.0.1",
        port=8792,
        public_url="http://127.0.0.1:8792",
        db_path=tmp_path / "bridge.db",
    )


@pytest.fixture
def db(settings):
    from claude_grok_mcp_bridge.db import BridgeDB

    return BridgeDB(settings.db_path)
