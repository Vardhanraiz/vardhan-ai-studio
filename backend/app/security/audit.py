"""Audit logging service for sensitive workspace, project, terminal, and agent actions."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import AuditLog

_SENSITIVE_KEYS = {"api_key", "secret", "password", "token", "authorization"}


def _sanitize_details(details: dict[str, Any] | str | None) -> str:
    if details is None:
        return ""
    if isinstance(details, str):
        return details
    cleaned: dict[str, Any] = {}
    for key, value in details.items():
        if any(s in key.lower() for s in _SENSITIVE_KEYS):
            cleaned[key] = "[REDACTED]"
        else:
            cleaned[key] = value
    return json.dumps(cleaned, ensure_ascii=False)


def record_audit_event(
    db: Session,
    *,
    action: str,
    actor: str = "user",
    target_path: str = "",
    status: str = "success",
    details: dict[str, Any] | str | None = None,
    commit: bool = True,
) -> AuditLog:
    """Persist an audit event to SQLite."""
    entry = AuditLog(
        action=action,
        actor=actor,
        target_path=target_path,
        status=status,
        details=_sanitize_details(details),
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    return entry
