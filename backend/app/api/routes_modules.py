"""API routes for Debugger, App Builder, Database Assistant, Testing Agent, Git, and Deployment."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_db
from app.core.config import Settings
from app.schemas.project import ProjectCreate
from app.security.auth import verify_api_key
from app.security.sandbox import WorkspaceSecurityError
from app.services import (
    builder_service,
    database_service,
    debugger_service,
    deploy_service,
    git_service,
    project_service,
    testing_service,
)
from app.services.project_service import ProjectConflictError, ProjectNotFoundError

router = APIRouter(
    prefix="/api/v1",
    tags=["modules"],
    dependencies=[Depends(verify_api_key)],
)


def _get_project(db: Session, project_id: int):
    try:
        return project_service.get_project_by_id(db, project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------- MODULE 4: PROMPT-TO-APPLICATION BUILDER ----------
class AppBuildRequest(BaseModel):
    app_name: str = Field(..., min_length=2, max_length=120)
    prompt: str = Field(..., min_length=10, max_length=6000)
    frontend_stack: str = Field(default="HTML/CSS/JavaScript")
    backend_stack: str = Field(default="Python FastAPI")
    database_stack: str = Field(default="SQLite")


@router.post("/builder/generate")
def generate_application(
    payload: AppBuildRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    try:
        return builder_service.build_application_from_prompt(
            db,
            app_name=payload.app_name,
            prompt=payload.prompt,
            frontend_stack=payload.frontend_stack,
            backend_stack=payload.backend_stack,
            database_stack=payload.database_stack,
            settings=settings,
        )
    except ProjectConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# ---------- MODULE 5: AI DEBUGGER ----------
class DebugAnalyzeRequest(BaseModel):
    error_text: str = Field(..., min_length=3, max_length=20000)
    project_id: Optional[int] = None
    file_path: Optional[str] = None
    model_name: Optional[str] = None


@router.post("/debugger/analyze")
async def analyze_debug_error(
    payload: DebugAnalyzeRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, payload.project_id) if payload.project_id is not None else None
    return await debugger_service.analyze_error(
        db,
        error_text=payload.error_text,
        project=project,
        file_path=payload.file_path,
        settings=settings,
        model_override=payload.model_name,
    )


# ---------- MODULE 7: DATABASE ASSISTANT ----------
class SqlQueryRequest(BaseModel):
    db_path: str = Field(..., min_length=3, max_length=300)
    sql: str = Field(..., min_length=3, max_length=20000)
    approved: bool = Field(default=False)
    create_if_missing: bool = Field(default=False)


@router.get("/projects/{project_id}/database/list")
def list_project_databases(
    project_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    dbs = database_service.list_sqlite_databases(project.relative_path, settings.workspace_root)
    return {"databases": dbs}


@router.get("/projects/{project_id}/database/schema")
def inspect_project_database(
    project_id: int,
    db_path: str = Query(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    try:
        schema = database_service.inspect_sqlite_schema(
            project.relative_path, db_path, settings.workspace_root
        )
        for tbl in schema["tables"]:
            tbl["crud_sql"] = database_service.generate_crud_sql(tbl["name"], tbl["columns"])
        return schema
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/projects/{project_id}/database/query")
def run_project_sql(
    project_id: int,
    payload: SqlQueryRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    try:
        return database_service.execute_sqlite_query(
            db,
            project_rel_path=project.relative_path,
            db_rel_path=payload.db_path,
            sql=payload.sql,
            approved=payload.approved,
            workspace_root=settings.workspace_root,
            create_if_missing=payload.create_if_missing,
        )
    except WorkspaceSecurityError:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------- MODULE 8: AI TESTING AGENT ----------
class TestRunRequest(BaseModel):
    framework: str
    command: str
    approved: bool = Field(default=False)


class TestGenerateRequest(BaseModel):
    target_file: str
    test_type: str = Field(default="unit", pattern="^(unit|integration|browser)$")
    model_name: Optional[str] = None


@router.get("/projects/{project_id}/tests/frameworks")
def detect_project_test_frameworks(
    project_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    return {
        "frameworks": testing_service.detect_test_frameworks(
            project.relative_path, settings.workspace_root
        )
    }


@router.post("/projects/{project_id}/tests/run")
def run_tests(
    project_id: int,
    payload: TestRunRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    return testing_service.run_project_tests(
        db,
        project=project,
        framework=payload.framework,
        command=payload.command,
        approved=payload.approved,
        settings=settings,
    )


@router.post("/projects/{project_id}/tests/generate")
async def generate_tests(
    project_id: int,
    payload: TestGenerateRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    try:
        return await testing_service.generate_tests_for_file(
            db,
            project=project,
            target_file=payload.target_file,
            test_type=payload.test_type,
            settings=settings,
            model_override=payload.model_name,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------- MODULE 9: GITHUB / GIT INTEGRATION ----------
class GitBranchRequest(BaseModel):
    branch_name: str = Field(..., min_length=1, max_length=80)
    create: bool = Field(default=False)


class GitCommitRequest(BaseModel):
    message: str = Field(..., min_length=2, max_length=500)
    approved: bool = Field(default=False)


class GitCloneRequest(BaseModel):
    repo_url: str
    project_name: str = Field(..., min_length=2, max_length=120)
    slug: str = Field(..., min_length=2, max_length=63)
    approved: bool = Field(default=False)


@router.get("/projects/{project_id}/git/overview")
def get_git_overview(
    project_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    status_info = git_service.get_git_status(project.relative_path, settings.workspace_root)
    return {
        "status": status_info,
        "branches": git_service.get_git_branches(project.relative_path, settings.workspace_root),
        "commits": git_service.get_git_log(project.relative_path, settings.workspace_root),
        "diff": git_service.get_git_diff(project.relative_path, settings.workspace_root)[:20000],
    }


@router.post("/projects/{project_id}/git/init")
def init_project_git(
    project_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    try:
        return git_service.init_git_repo(db, project.relative_path, settings.workspace_root)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/git/branch")
def switch_project_branch(
    project_id: int,
    payload: GitBranchRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    try:
        return git_service.create_or_switch_branch(
            db,
            project_rel_path=project.relative_path,
            branch_name=payload.branch_name,
            create=payload.create,
            workspace_root=settings.workspace_root,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/git/commit")
def commit_project_changes(
    project_id: int,
    payload: GitCommitRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    try:
        return git_service.create_git_commit(
            db,
            project_rel_path=project.relative_path,
            message=payload.message,
            approved=payload.approved,
            workspace_root=settings.workspace_root,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/git/clone")
def clone_repository(
    payload: GitCloneRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    result = git_service.clone_github_repo(
        db,
        repo_url=payload.repo_url,
        target_slug=payload.slug,
        approved=payload.approved,
        workspace_root=settings.workspace_root,
    )
    if result.get("approval_required"):
        return result

    project = project_service.create_project(
        db,
        ProjectCreate(
            name=payload.project_name,
            slug=payload.slug,
            description=f"Cloned from {payload.repo_url}",
            tech_stack="Imported Git Repository",
        ),
        settings.workspace_root,
    )
    return {**result, "project_id": project.id}


# ---------- MODULE 10: DEPLOYMENT ASSISTANT ----------
@router.get("/projects/{project_id}/deploy/plan")
def get_deployment_plan(
    project_id: int,
    target: str = Query(default="Render"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    project = _get_project(db, project_id)
    return deploy_service.generate_deployment_plan(
        project.relative_path, target, settings.workspace_root
    )
