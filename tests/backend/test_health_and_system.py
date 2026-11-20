"""Tests for system health, metadata, WebSocket ping, and optional API key auth."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_root_endpoint(client: TestClient) -> None:
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["app"] == "Vardhan AI Studio"
    assert body["health"] == "/api/v1/health"


def test_health_endpoint_ok(client: TestClient) -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["workspace_ready"] is True


def test_system_info_returns_safe_local_defaults(client: TestClient) -> None:
    resp = client.get("/api/v1/system/info")
    assert resp.status_code == 200
    body = resp.json()
    assert body["app_name"] == "Vardhan AI Studio"
    assert body["database_dialect"] == "sqlite"
    assert body["ai_provider"] == "ollama"
    assert body["ollama_default_model"] == "qwen2.5-coder:1.5b"
    assert body["external_cloud_configured"] is False
    assert body["project_count"] == 0
    assert body["audit_log_count"] == 0


def test_websocket_ping_echo(client: TestClient) -> None:
    with client.websocket_connect("/api/v1/ws/ping") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "connected"
        assert hello["service"] == "Vardhan AI Studio"

        ws.send_json({"message": "hello-studio"})
        reply = ws.receive_json()
        assert reply["type"] == "pong"
        assert reply["echo"] == {"message": "hello-studio"}


def test_optional_api_auth_enforcement(tmp_path: Path) -> None:
    settings = Settings(
        app_env="testing",
        app_debug=False,
        workspace_root=tmp_path / "workspace",
        backup_dir=tmp_path / "backups",
        database_url=f"sqlite:///{(tmp_path / 'auth.db').as_posix()}",
        api_auth_enabled=True,
        api_secret_key="super-secret-local-token",
    )
    app = create_app(settings_override=settings)
    with TestClient(app) as auth_client:
        # Health remains accessible for probes
        assert auth_client.get("/api/v1/health").status_code == 200

        # Protected endpoints reject missing or wrong key
        assert auth_client.get("/api/v1/system/info").status_code == 401
        assert (
            auth_client.get("/api/v1/system/info", headers={"X-API-Key": "wrong"}).status_code
            == 401
        )

        # Valid key succeeds
        ok = auth_client.get(
            "/api/v1/system/info",
            headers={"X-API-Key": "super-secret-local-token"},
        )
        assert ok.status_code == 200
        assert ok.json()["api_auth_enabled"] is True
