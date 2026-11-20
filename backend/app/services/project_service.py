"""Project management service enforcing workspace sandboxing and audit logging."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.entities import Project
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.security.audit import record_audit_event
from app.security.sandbox import resolve_workspace_path, validate_project_slug


class ProjectConflictError(ValueError):
    """Raised when a project with the requested slug already exists."""


class ProjectNotFoundError(LookupError):
    """Raised when a requested project ID does not exist."""


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if len(slug) < 2:
        slug = f"project-{slug or 'app'}"
    return slug[:63]


def list_projects(db: Session) -> list[Project]:
    stmt = select(Project).order_by(desc(Project.last_opened_at), desc(Project.created_at))
    return list(db.scalars(stmt).all())


def get_project_by_id(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise ProjectNotFoundError(f"Project {project_id} not found.")
    return project


def create_project(db: Session, payload: ProjectCreate, workspace_root: Path) -> Project:
    raw_slug = payload.slug if payload.slug else _slugify(payload.name)
    slug = validate_project_slug(raw_slug)

    existing = db.scalar(select(Project).where(Project.slug == slug))
    if existing is not None:
        raise ProjectConflictError(f"A project with slug '{slug}' already exists.")

    project_dir = resolve_workspace_path(slug, workspace_root)
    project_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    project = Project(
        name=payload.name.strip(),
        slug=slug,
        description=payload.description.strip(),
        relative_path=slug,
        tech_stack=payload.tech_stack.strip(),
        last_opened_at=now,
    )
    db.add(project)
    db.flush()

    record_audit_event(
        db,
        action="project.create",
        actor="user",
        target_path=slug,
        status="success",
        details={"project_id": project.id, "name": project.name, "tech_stack": project.tech_stack},
        commit=False,
    )
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, project_id: int, payload: ProjectUpdate) -> Project:
    project = get_project_by_id(db, project_id)

    changes: dict[str, Optional[str | bool]] = {}
    if payload.name is not None:
        project.name = payload.name.strip()
        changes["name"] = project.name
    if payload.description is not None:
        project.description = payload.description.strip()
        changes["description"] = "updated"
    if payload.tech_stack is not None:
        project.tech_stack = payload.tech_stack.strip()
        changes["tech_stack"] = project.tech_stack
    if payload.mark_opened:
        project.last_opened_at = datetime.now(timezone.utc)
        changes["mark_opened"] = True

    record_audit_event(
        db,
        action="project.update",
        actor="user",
        target_path=project.relative_path,
        status="success",
        details={"project_id": project.id, "changes": changes},
        commit=False,
    )
    db.commit()
    db.refresh(project)
    return project


def delete_project_metadata(db: Session, project_id: int) -> None:
    """Delete a project record without destructively deleting files on disk."""
    project = get_project_by_id(db, project_id)
    rel_path = project.relative_path
    name = project.name
    db.delete(project)
    record_audit_event(
        db,
        action="project.unregister",
        actor="user",
        target_path=rel_path,
        status="success",
        details={"project_id": project_id, "name": name, "files_deleted": False},
        commit=False,
    )
    db.commit()
