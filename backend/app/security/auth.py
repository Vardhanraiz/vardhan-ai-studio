"""Optional API key authentication when network access is enabled."""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import Header, HTTPException, Request, status

from app.core.config import Settings


def verify_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> None:
    """Enforce `X-API-Key` header if `API_AUTH_ENABLED=true`."""
    settings: Settings = request.app.state.settings
    if not settings.api_auth_enabled:
        return

    if not x_api_key or not secrets.compare_digest(x_api_key, settings.api_secret_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
        )
