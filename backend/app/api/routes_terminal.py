"""Sandboxed PowerShell terminal execution endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_db
from app.core.config import Settings
from app.security.auth import verify_api_key
from app.services import project_service, terminal_service
from app.services.project_service import ProjectNotFoundError

router = APIRouter(
    prefix="/api/v1/terminal",
    tags=["terminal"],
    dependencies=[Depends(verify_api_key)],
)


class TerminalRunRequest(BaseModel):
    project_id: int
    command: str = Field(..., min_length=1, max_length=2000)
    approved: bool = Field(default=False)
    timeout_sec: int = Field(default=30, ge=1, le=120)


@router.post("/classify")
def classify_terminal_command(command: str) -> dict:
    risk, reason = terminal_service.classify_command(command)
    return {"command": command, "risk_level": risk, "reason": reason}


@router.post("/run")
def run_terminal_command(
    payload: TerminalRunRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    try:
        project = project_service.get_project_by_id(db, payload.project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return terminal_service.run_sandboxed_command(
        db,
        command=payload.command,
        project_rel_path=project.relative_path,
        workspace_root=settings.workspace_root,
        approved=payload.approved,
        timeout_sec=payload.timeout_sec,
    )
