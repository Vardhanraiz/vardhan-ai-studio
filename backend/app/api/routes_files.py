"""Sandboxed project file explorer, editor read/save, diff, search, backup restore, and preview."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_db
from app.core.config import Settings
from app.security.auth import verify_api_key
from app.security.sandbox import WorkspaceSecurityError
from app.services import file_service, project_service
from app.services.project_service import ProjectNotFoundError

router = APIRouter(
    prefix="/api/v1/projects/{project_id}",
    tags=["files"],
    dependencies=[Depends(verify_api_key)],
)


class FileCreateRequest(BaseModel):
    path: str = Field(..., min_length=1, max_length=400)
    type: str = Field(default="file", pattern="^(file|directory)$")
    content: str = Field(default="")
    overwrite: bool = Field(default=False)


class FileSaveRequest(BaseModel):
    path: str = Field(..., min_length=1, max_length=400)
    content: str = Field(default="")


class FileDiffRequest(BaseModel):
    path: str = Field(..., min_length=1, max_length=400)
    proposed_content: str = Field(default="")


class FileSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)
    case_sensitive: bool = Field(default=False)


class RestoreBackupRequest(BaseModel):
    path: str
    backup_path: str


def _get_project_or_404(db: Session, project_id: int):
    try:
        return project_service.get_project_by_id(db, project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/files/tree")
def get_file_tree(
    project_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project_or_404(db, project_id)
    tree = file_service.build_file_tree(project.relative_path, settings.workspace_root)
    return {"project_id": project.id, "slug": project.slug, "tree": tree}


@router.get("/files/content")
def read_file_content(
    project_id: int,
    path: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project_or_404(db, project_id)
    try:
        return file_service.read_project_file(
            project.relative_path,
            path,
            settings.workspace_root,
            max_file_size_kb=settings.max_file_size_kb,
        )
    except WorkspaceSecurityError:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc


@router.post("/files/create", status_code=status.HTTP_201_CREATED)
def create_file_or_dir(
    project_id: int,
    payload: FileCreateRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project_or_404(db, project_id)
    try:
        return file_service.create_project_entry(
            db,
            project_rel_path=project.relative_path,
            file_rel_path=payload.path,
            entry_type=payload.type,
            content=payload.content,
            workspace_root=settings.workspace_root,
            overwrite=payload.overwrite,
            backup_root=settings.backup_dir,
        )
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.put("/files/save")
def save_file(
    project_id: int,
    payload: FileSaveRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project_or_404(db, project_id)
    return file_service.save_project_file(
        db,
        project_rel_path=project.relative_path,
        file_rel_path=payload.path,
        content=payload.content,
        workspace_root=settings.workspace_root,
        backup_root=settings.backup_dir,
    )


@router.post("/files/diff")
def preview_file_diff(
    project_id: int,
    payload: FileDiffRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project_or_404(db, project_id)
    try:
        current = file_service.read_project_file(
            project.relative_path, payload.path, settings.workspace_root
        )["content"]
    except FileNotFoundError:
        current = ""
    diff = file_service.compute_unified_diff(payload.path, current, payload.proposed_content)
    return {"path": payload.path, "unified_diff": diff}


@router.post("/files/search")
def search_files(
    project_id: int,
    payload: FileSearchRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project_or_404(db, project_id)
    matches = file_service.search_project_files(
        project.relative_path,
        payload.query,
        settings.workspace_root,
        case_sensitive=payload.case_sensitive,
    )
    return {"query": payload.query, "count": len(matches), "matches": matches}


@router.delete("/files")
def delete_file(
    project_id: int,
    path: str = Query(..., min_length=1),
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Explicit confirmation (confirm=true) is required before deleting project files.",
        )
    project = _get_project_or_404(db, project_id)
    try:
        return file_service.delete_project_entry(
            db,
            project_rel_path=project.relative_path,
            file_rel_path=path,
            workspace_root=settings.workspace_root,
            backup_root=settings.backup_dir,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/files/restore")
def restore_file_backup(
    project_id: int,
    payload: RestoreBackupRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project_or_404(db, project_id)
    try:
        return file_service.restore_backup_file(
            db,
            project_rel_path=project.relative_path,
            file_rel_path=payload.path,
            backup_rel_path=payload.backup_path,
            workspace_root=settings.workspace_root,
            backup_root=settings.backup_dir,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/preview/{file_path:path}", response_class=HTMLResponse)
def preview_html_file(
    project_id: int,
    file_path: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> HTMLResponse:
    project = _get_project_or_404(db, project_id)
    try:
        data = file_service.read_project_file(
            project.relative_path, file_path, settings.workspace_root
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return HTMLResponse(content=data["content"])
