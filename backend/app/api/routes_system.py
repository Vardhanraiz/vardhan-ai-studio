"""System health, runtime metadata, and audit log endpoints."""

from __future__ import annotations

import platform
import sys
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_db
from app.core.config import Settings
from app.database.session import DatabaseManager
from app.models.entities import AuditLog, Project
from app.schemas.system import AuditLogRead, HealthResponse, SystemInfoResponse
from app.security.auth import verify_api_key

router = APIRouter(prefix="/api/v1", tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health_check(
    request: Request,
    settings: Settings = Depends(get_app_settings),
) -> HealthResponse:
    """Verify database connectivity and workspace sandbox availability."""
    db_manager: DatabaseManager = request.app.state.db_manager
    db_status = "ok"
    try:
        db_manager.check_connection()
    except Exception:
        db_status = "error"

    workspace_ready = settings.workspace_root.exists() and settings.workspace_root.is_dir()
    overall = "ok" if db_status == "ok" and workspace_ready else "degraded"

    return HealthResponse(
        status=overall,
        app_name=settings.app_name,
        version=settings.app_version,
        database=db_status,
        workspace_ready=workspace_ready,
        timestamp=datetime.now(timezone.utc),
    )


@router.get(
    "/system/info",
    response_model=SystemInfoResponse,
    dependencies=[Depends(verify_api_key)],
)
def system_info(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> SystemInfoResponse:
    """Return non-secret runtime metadata for the dashboard and diagnostics."""
    db_manager: DatabaseManager = request.app.state.db_manager
    project_count = db.scalar(select(func.count(Project.id))) or 0
    audit_log_count = db.scalar(select(func.count(AuditLog.id))) or 0

    return SystemInfoResponse(
        app_name=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
        python_version=sys.version.split()[0],
        platform=f"{platform.system()} {platform.release()}",
        database_dialect=db_manager.dialect_name,
        workspace_folder_name=settings.workspace_root.name,
        ai_provider=settings.ai_provider,
        ollama_base_url=settings.ollama_base_url,
        ollama_default_model=settings.ollama_default_model,
        api_auth_enabled=settings.api_auth_enabled,
        external_cloud_configured=settings.external_cloud_configured,
        project_count=project_count,
        audit_log_count=audit_log_count,
    )


@router.get(
    "/audit-logs",
    response_model=list[AuditLogRead],
    dependencies=[Depends(verify_api_key)],
)
def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[AuditLog]:
    """Retrieve recent audit trail entries."""
    stmt = select(AuditLog).order_by(desc(AuditLog.id)).offset(offset).limit(limit)
    return list(db.scalars(stmt).all())
