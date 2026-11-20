"""Autonomous Coding Agent endpoints: plan, inspect diffs, approve, reject, and revert."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.agents import coding_agent
from app.api.deps import get_app_settings, get_db
from app.core.config import Settings
from app.models.entities import AgentTask
from app.security.auth import verify_api_key
from app.services import project_service
from app.services.project_service import ProjectNotFoundError

router = APIRouter(
    prefix="/api/v1/agent",
    tags=["agent"],
    dependencies=[Depends(verify_api_key)],
)


class AgentPlanRequest(BaseModel):
    project_id: int
    instruction: str = Field(..., min_length=4, max_length=8000)
    model_name: Optional[str] = None


class ChangeDecisionRequest(BaseModel):
    change_ids: Optional[list[int]] = None


@router.get("/tasks")
def list_agent_tasks(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(AgentTask).order_by(desc(AgentTask.id)).limit(30)
    if project_id is not None:
        stmt = stmt.where(AgentTask.project_id == project_id)
    tasks = db.scalars(stmt).all()
    return [coding_agent.serialize_task(t) for t in tasks]


@router.post("/plan", status_code=status.HTTP_201_CREATED)
async def create_agent_plan(
    payload: AgentPlanRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    try:
        project = project_service.get_project_by_id(db, payload.project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return await coding_agent.plan_agent_task(
        db,
        project=project,
        instruction=payload.instruction,
        settings=settings,
        model_override=payload.model_name,
    )


@router.post("/tasks/{task_id}/approve")
def approve_agent_changes(
    task_id: int,
    payload: ChangeDecisionRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    task = db.get(AgentTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Agent task not found.")
    project = project_service.get_project_by_id(db, task.project_id)
    return coding_agent.apply_approved_changes(
        db,
        task=task,
        project=project,
        change_ids=payload.change_ids,
        settings=settings,
    )


@router.post("/tasks/{task_id}/reject")
def reject_agent_changes(
    task_id: int,
    payload: ChangeDecisionRequest,
    db: Session = Depends(get_db),
) -> dict:
    task = db.get(AgentTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Agent task not found.")
    project = project_service.get_project_by_id(db, task.project_id)
    return coding_agent.reject_task_changes(
        db,
        task=task,
        project=project,
        change_ids=payload.change_ids,
    )


@router.post("/tasks/{task_id}/changes/{change_id}/revert")
def revert_agent_change(
    task_id: int,
    change_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    task = db.get(AgentTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Agent task not found.")
    project = project_service.get_project_by_id(db, task.project_id)
    try:
        return coding_agent.revert_applied_change(
            db, task=task, project=project, change_id=change_id, settings=settings
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
