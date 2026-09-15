"""OAuth 2.1 Authorization Code + PKCE + Dynamic Client Registration."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    OAuthAuthorizationServerProvider,
    RefreshToken,
    RegistrationError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl

from .config import ALLOWED_REDIRECT_HOSTS, DEFAULT_SCOPES, Settings


def redirect_host_allowed(uri: str | AnyUrl) -> bool:
    host = (urlparse(str(uri)).hostname or "").lower()
    if not host:
        return False
    if host in ALLOWED_REDIRECT_HOSTS:
        return True
    # Allow subdomains of allowlisted hosts (e.g. www.claude.ai)
    return any(host.endswith("." + allowed) for allowed in ALLOWED_REDIRECT_HOSTS if allowed not in ("localhost", "127.0.0.1", "[::1]"))


def assert_redirect_uris_allowed(uris: list[AnyUrl] | None) -> None:
    if not uris:
        raise RegistrationError(
            error="invalid_redirect_uri",
            error_description="At least one redirect_uri is required",
        )
    for uri in uris:
        if not redirect_host_allowed(uri):
            raise RegistrationError(
                error="invalid_redirect_uri",
                error_description=(
                    f"Redirect URI host not allowlisted: {urlparse(str(uri)).hostname}. "
                    f"Allowed: {', '.join(sorted(ALLOWED_REDIRECT_HOSTS))}"
                ),
            )


@dataclass
class PendingAuthorization:
    client_id: str
    params: AuthorizationParams
    created_at: float = field(default_factory=time.time)


class BridgeOAuthProvider(OAuthAuthorizationServerProvider[AuthorizationCode, RefreshToken, AccessToken]):
    """In-memory OAuth provider with BRIDGE_TOKEN consent gate."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.clients: dict[str, OAuthClientInformationFull] = {}
        self.auth_codes: dict[str, AuthorizationCode] = {}
        self.access_tokens: dict[str, AccessToken] = {}
        self.refresh_tokens: dict[str, RefreshToken] = {}
        self.pending: dict[str, PendingAuthorization] = {}
        # Map refresh -> access for revoke
        self._refresh_to_access: dict[str, str] = {}

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        return self.clients.get(client_id)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        assert_redirect_uris_allowed(client_info.redirect_uris)
        self.clients[client_info.client_id] = client_info

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        if not redirect_host_allowed(params.redirect_uri):
            raise AuthorizeError(
                error="invalid_request",
                error_description=f"Redirect URI host not allowlisted: {params.redirect_uri}",
            )
        pending_id = secrets.token_urlsafe(24)
        self.pending[pending_id] = PendingAuthorization(client_id=client.client_id, params=params)
        return f"{self.settings.issuer_url}/consent?pending_id={pending_id}"

    def get_pending(self, pending_id: str) -> PendingAuthorization | None:
        pending = self.pending.get(pending_id)
        if not pending:
            return None
        if time.time() - pending.created_at > 600:
            self.pending.pop(pending_id, None)
            return None
        return pending

    def complete_consent(self, pending_id: str, bridge_token: str) -> str:
        """Validate BRIDGE_TOKEN, issue auth code, return redirect URL to client."""
        if not secrets.compare_digest(bridge_token, self.settings.bridge_token):
            raise PermissionError("Invalid BRIDGE_TOKEN")

        pending = self.get_pending(pending_id)
        if not pending:
            raise ValueError("Unknown or expired authorization request")

        code = secrets.token_urlsafe(32)
        auth_code = AuthorizationCode(
            code=code,
            client_id=pending.client_id,
            scopes=pending.params.scopes or list(DEFAULT_SCOPES),
            expires_at=time.time() + 300,
            code_challenge=pending.params.code_challenge,
            redirect_uri=pending.params.redirect_uri,
            redirect_uri_provided_explicitly=pending.params.redirect_uri_provided_explicitly,
            resource=pending.params.resource,
            subject="bridge-operator",
        )
        self.auth_codes[code] = auth_code
        self.pending.pop(pending_id, None)

        return construct_redirect_uri(
            str(pending.params.redirect_uri),
            code=code,
            state=pending.params.state,
        )

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        code = self.auth_codes.get(authorization_code)
        if not code:
            return None
        if code.client_id != client.client_id:
            return None
        if code.expires_at < time.time():
            self.auth_codes.pop(authorization_code, None)
            return None
        return code

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        self.auth_codes.pop(authorization_code.code, None)
        return self._issue_tokens(client.client_id, authorization_code.scopes, authorization_code.resource)

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        token = self.refresh_tokens.get(refresh_token)
        if not token or token.client_id != client.client_id:
            return None
        if token.expires_at is not None and token.expires_at < int(time.time()):
            self.refresh_tokens.pop(refresh_token, None)
            return None
        return token

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        # Rotate
        old_access = self._refresh_to_access.pop(refresh_token.token, None)
        if old_access:
            self.access_tokens.pop(old_access, None)
        self.refresh_tokens.pop(refresh_token.token, None)
        granted = scopes or refresh_token.scopes
        return self._issue_tokens(client.client_id, granted, refresh_token.resource)

    async def load_access_token(self, token: str) -> AccessToken | None:
        access = self.access_tokens.get(token)
        if not access:
            return None
        if access.expires_at is not None and access.expires_at < int(time.time()):
            self.access_tokens.pop(token, None)
            return None
        return access

    async def verify_token(self, token: str) -> AccessToken | None:
        return await self.load_access_token(token)

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        if isinstance(token, AccessToken):
            self.access_tokens.pop(token.token, None)
            # Also drop matching refresh
            for r, a in list(self._refresh_to_access.items()):
                if a == token.token:
                    self._refresh_to_access.pop(r, None)
                    self.refresh_tokens.pop(r, None)
        else:
            access = self._refresh_to_access.pop(token.token, None)
            self.refresh_tokens.pop(token.token, None)
            if access:
                self.access_tokens.pop(access, None)

    def _issue_tokens(self, client_id: str, scopes: list[str], resource: str | None) -> OAuthToken:
        now = int(time.time())
        access = secrets.token_urlsafe(32)
        refresh = secrets.token_urlsafe(32)
        expires_in = 3600
        access_token = AccessToken(
            token=access,
            client_id=client_id,
            scopes=scopes,
            expires_at=now + expires_in,
            resource=resource or self.settings.mcp_url,
            subject="bridge-operator",
        )
        refresh_token = RefreshToken(
            token=refresh,
            client_id=client_id,
            scopes=scopes,
            expires_at=now + 86400 * 30,
            resource=resource or self.settings.mcp_url,
            subject="bridge-operator",
        )
        self.access_tokens[access] = access_token
        self.refresh_tokens[refresh] = refresh_token
        self._refresh_to_access[refresh] = access
        return OAuthToken(
            access_token=access,
            token_type="Bearer",
            expires_in=expires_in,
            scope=" ".join(scopes),
            refresh_token=refresh,
        )


CONSENT_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Claude ↔ Grok MCP Bridge — Consent</title>
  <style>
    :root {{ color-scheme: light dark; }}
    body {{ font-family: system-ui, sans-serif; max-width: 420px; margin: 3rem auto; padding: 0 1rem; }}
    h1 {{ font-size: 1.25rem; }}
    label {{ display: block; margin: 1rem 0 0.35rem; font-weight: 600; }}
    input[type=password] {{ width: 100%; padding: 0.6rem; font-size: 1rem; box-sizing: border-box; }}
    button {{ margin-top: 1.25rem; width: 100%; padding: 0.7rem; font-size: 1rem; cursor: pointer; }}
    .err {{ color: #c00; margin-top: 0.75rem; }}
    .hint {{ opacity: 0.75; font-size: 0.9rem; }}
  </style>
</head>
<body>
  <h1>Authorize Claude ↔ Grok Bridge</h1>
  <p class="hint">Enter the shared <code>BRIDGE_TOKEN</code> to allow this client to use the mailbox and task board.</p>
  <form method="post" action="/consent">
    <input type="hidden" name="pending_id" value="{pending_id}"/>
    <label for="token">BRIDGE_TOKEN</label>
    <input id="token" name="token" type="password" required autofocus autocomplete="current-password"/>
    <button type="submit">Approve</button>
  </form>
  {error_html}
</body>
</html>
"""
