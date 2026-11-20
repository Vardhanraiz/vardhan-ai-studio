"""System health, runtime metadata, and audit log schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    app_name: str
    version: str
    database: Literal["ok", "error"]
    workspace_ready: bool
    timestamp: datetime


class SystemInfoResponse(BaseModel):
    app_name: str
    version: str
    environment: str
    python_version: str
    platform: str
    database_dialect: str
    workspace_folder_name: str
    ai_provider: str
    ollama_base_url: str
    ollama_default_model: str
    api_auth_enabled: bool
    external_cloud_configured: bool
    project_count: int
    audit_log_count: int


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    actor: str
    target_path: str
    status: str
    details: str
    created_at: datetime
