"""Shared pytest fixtures providing isolated SQLite DB and workspace sandbox per test."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture()
def test_settings(tmp_path: Path) -> Settings:
    workspace = tmp_path / "workspace"
    backups = tmp_path / "backups"
    db_file = tmp_path / "test_vardhan.db"
    return Settings(
        app_env="testing",
        app_debug=False,
        workspace_root=workspace,
        backup_dir=backups,
        database_url=f"sqlite:///{db_file.as_posix()}",
        api_auth_enabled=False,
    )


@pytest.fixture()
def client(test_settings: Settings) -> Iterator[TestClient]:
    app = create_app(settings_override=test_settings)
    with TestClient(app) as test_client:
        yield test_client
