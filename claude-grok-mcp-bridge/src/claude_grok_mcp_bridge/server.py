"""MCP server: Streamable HTTP + stdio, OAuth, mailbox & task tools."""

from __future__ import annotations

import json
from typing import Any, Literal

from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions
from mcp.server.mcpserver import MCPServer
from pydantic import AnyHttpUrl
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from .config import DEFAULT_SCOPES, Settings, get_settings
from .db import BridgeDB
from .oauth import CONSENT_HTML, BridgeOAuthProvider

Side = Literal["claude", "grok"]
ToSide = Literal["claude", "grok", "both"]
TaskStatus = Literal["open", "in_progress", "done", "cancelled"]


def create_server(
    settings: Settings | None = None,
    *,
    enable_auth: bool = True,
    db: BridgeDB | None = None,
) -> tuple[MCPServer, BridgeDB, BridgeOAuthProvider | None]:
    settings = settings or get_settings()
    store = db or BridgeDB(settings.db_path)

    oauth: BridgeOAuthProvider | None = None
    auth_settings: AuthSettings | None = None

    if enable_auth:
        oauth = BridgeOAuthProvider(settings)
        auth_settings = AuthSettings(
            issuer_url=AnyHttpUrl(settings.issuer_url),
            resource_server_url=AnyHttpUrl(settings.mcp_url),
            client_registration_options=ClientRegistrationOptions(
                enabled=True,
                valid_scopes=list(DEFAULT_SCOPES),
                default_scopes=list(DEFAULT_SCOPES),
            ),
            required_scopes=list(DEFAULT_SCOPES),
            validate_token_resource=False,
        )

    mcp = MCPServer(
        name="claude-grok-mcp-bridge",
        title="Claude ↔ Grok MCP Bridge",
        description="Shared mailbox and task board for Claude and Grok Bot",
        instructions=(
            "Use send_message for async notes between Claude and Grok. "
            "Use create_task when you need tracked work with status updates. "
            "Always set as_side to your own identity (claude or grok)."
        ),
        version="0.1.0",
        auth=auth_settings,
        auth_server_provider=oauth,
    )

    @mcp.tool(description="Bridge health and mailbox/task counters")
    async def bridge_status() -> dict[str, Any]:
        status = await store.bridge_status()
        status["public_url"] = settings.public_url
        status["mcp_url"] = settings.mcp_url
        return status

    @mcp.tool(description="Send a message to claude, grok, or both")
    async def send_message(
        to: ToSide,
        subject: str,
        body: str,
        as_side: Side,
        thread_id: str | None = None,
    ) -> dict[str, Any]:
        if to not in ("claude", "grok", "both"):
            raise ValueError("to must be claude|grok|both")
        if as_side not in ("claude", "grok"):
            raise ValueError("as_side must be claude|grok")
        return await store.send_message(
            to=to,
            subject=subject,
            body=body,
            as_side=as_side,
            thread_id=thread_id,
        )

    @mcp.tool(description="List messages visible to a side")
    async def list_messages(
        for_side: Side,
        unread_only: bool = False,
        thread_id: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        messages = await store.list_messages(
            for_side=for_side,
            unread_only=unread_only,
            thread_id=thread_id,
            limit=limit,
        )
        return {"messages": messages, "count": len(messages)}

    @mcp.tool(description="Fetch a single message by id")
    async def get_message(message_id: str) -> dict[str, Any]:
        msg = await store.get_message(message_id)
        if not msg:
            raise ValueError(f"Message not found: {message_id}")
        return msg

    @mcp.tool(description="Reply in the same thread as an existing message")
    async def reply_message(message_id: str, body: str, as_side: Side) -> dict[str, Any]:
        return await store.reply_message(message_id=message_id, body=body, as_side=as_side)

    @mcp.tool(description="Mark a message as read for a side")
    async def mark_read(message_id: str, as_side: Side) -> dict[str, Any]:
        return await store.mark_read(message_id=message_id, as_side=as_side)

    @mcp.tool(description="Create a tracked task on the shared board")
    async def create_task(
        title: str,
        brief: str,
        assign_to: ToSide,
        as_side: Side,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await store.create_task(
            title=title,
            brief=brief,
            assign_to=assign_to,
            as_side=as_side,
            metadata=metadata,
        )

    @mcp.tool(description="List tasks, optionally filtered by status or assignee")
    async def list_tasks(
        status: TaskStatus | None = None,
        assign_to: ToSide | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        tasks = await store.list_tasks(status=status, assign_to=assign_to, limit=limit)
        return {"tasks": tasks, "count": len(tasks)}

    @mcp.tool(description="Update task status (open|in_progress|done|cancelled)")
    async def update_task(
        task_id: str,
        status: TaskStatus,
        as_side: Side,
        result: str | None = None,
    ) -> dict[str, Any]:
        return await store.update_task(
            task_id=task_id,
            status=status,
            as_side=as_side,
            result=result,
        )

    @mcp.custom_route("/health", methods=["GET"])
    async def health(_request: Request) -> Response:
        return JSONResponse({"ok": True})

    # SDK mounts RFC 9728 metadata at /.well-known/oauth-protected-resource{resource_path}
    # (e.g. .../mcp). Also expose the root path clients commonly probe.
    @mcp.custom_route("/.well-known/oauth-protected-resource", methods=["GET"])
    async def oauth_protected_resource(_request: Request) -> Response:
        return JSONResponse(
            {
                "resource": settings.mcp_url,
                "authorization_servers": [settings.issuer_url],
                "scopes_supported": list(DEFAULT_SCOPES),
                "bearer_methods_supported": ["header"],
                "resource_name": "Claude ↔ Grok MCP Bridge",
            }
        )

    if oauth is not None:

        @mcp.custom_route("/consent", methods=["GET", "POST"])
        async def consent(request: Request) -> Response:
            if request.method == "GET":
                pending_id = request.query_params.get("pending_id", "")
                pending = oauth.get_pending(pending_id)
                if not pending:
                    return HTMLResponse(
                        "<h1>Expired</h1><p>Authorization request not found or expired.</p>",
                        status_code=400,
                    )
                html = CONSENT_HTML.format(pending_id=pending_id, error_html="")
                return HTMLResponse(html)

            form = await request.form()
            pending_id = str(form.get("pending_id", ""))
            token = str(form.get("token", ""))
            try:
                redirect = oauth.complete_consent(pending_id, token)
            except PermissionError:
                try:
                    html = CONSENT_HTML.format(
                        pending_id=pending_id,
                        error_html='<p class="err">Invalid BRIDGE_TOKEN.</p>',
                    )
                except (KeyError, ValueError):
                    html = (
                        "<h1>Unauthorized</h1>"
                        '<p class="err">Invalid BRIDGE_TOKEN.</p>'
                    )
                return HTMLResponse(html, status_code=401)
            except ValueError as exc:
                return HTMLResponse(f"<h1>Error</h1><p>{exc}</p>", status_code=400)
            return RedirectResponse(url=redirect, status_code=302)

    return mcp, store, oauth


def create_http_app(settings: Settings | None = None):
    """Build the Starlette ASGI app for Streamable HTTP + OAuth."""
    settings = settings or get_settings()
    mcp, _store, _oauth = create_server(settings, enable_auth=True)
    return mcp.streamable_http_app(
        streamable_http_path="/mcp",
        host=settings.host,
        stateless_http=True,
        json_response=True,
    )


def run_http(settings: Settings | None = None) -> None:
    import uvicorn

    settings = settings or get_settings()
    mcp, _, _ = create_server(settings, enable_auth=True)
    app = mcp.streamable_http_app(
        streamable_http_path="/mcp",
        host=settings.host,
        stateless_http=True,
        json_response=True,
    )
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")


def run_stdio(settings: Settings | None = None) -> None:
    """Stdio entrypoint for Claude Code (no OAuth)."""
    settings = settings or get_settings()
    mcp, _, _ = create_server(settings, enable_auth=False)
    mcp.run(transport="stdio")
