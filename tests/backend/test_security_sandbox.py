"""Security tests for workspace sandboxing, path traversal blocking, and audit sanitization."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.security.audit import _sanitize_details
from app.security.sandbox import (
    WorkspaceSecurityError,
    resolve_workspace_path,
    validate_project_slug,
)


def test_valid_relative_path_inside_workspace(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    resolved = resolve_workspace_path("demo-app/src/main.py", workspace)
    assert resolved == (workspace / "demo-app" / "src" / "main.py").resolve()


@pytest.mark.parametrize(
    "bad_path",
    [
        "../outside.txt",
        "demo/../../outside.txt",
        r"..\..\Windows\System32\drivers\etc\hosts",
        r"\\server\share\secret.txt",
        "//server/share/secret.txt",
        "demo/file\x00.txt",
        "CON",
        "demo/NUL.txt",
        "demo/COM1/test.py",
        "",
        ".",
    ],
)
def test_blocks_traversal_and_unsafe_paths(tmp_path: Path, bad_path: str) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    with pytest.raises(WorkspaceSecurityError):
        resolve_workspace_path(bad_path, workspace)


def test_blocks_absolute_path_outside_workspace(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    outside = tmp_path / "outside.txt"
    workspace.mkdir()
    outside.write_text("secret", encoding="utf-8")

    with pytest.raises(WorkspaceSecurityError):
        resolve_workspace_path(outside, workspace)


def test_validate_project_slug_rules() -> None:
    assert validate_project_slug("My_App-1") == "my_app-1"
    with pytest.raises(WorkspaceSecurityError):
        validate_project_slug("../escape")
    with pytest.raises(WorkspaceSecurityError):
        validate_project_slug("con")


def test_audit_detail_sanitization_redacts_secrets() -> None:
    sanitized = _sanitize_details(
        {"project": "demo", "api_key": "sk-12345", "db_password": "pw", "safe": "ok"}
    )
    assert "sk-12345" not in sanitized
    assert "pw" not in sanitized
    assert "[REDACTED]" in sanitized
    assert '"safe": "ok"' in sanitized
