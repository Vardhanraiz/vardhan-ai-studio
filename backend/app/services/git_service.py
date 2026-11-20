"""Git and GitHub workflow service sandboxed to project directories."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.security.audit import record_audit_event
from app.security.sandbox import WorkspaceSecurityError, resolve_workspace_path, validate_project_slug

_SAFE_GIT_HTTPS_RE = re.compile(r"^https://(github\.com|gitlab\.com|bitbucket\.org)/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?$")
_SAFE_BRANCH_RE = re.compile(r"^[A-Za-z0-9._/\-]{1,80}$")


def _run_git(args: list[str], cwd: Path, timeout: int = 30) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout,
        encoding="utf-8",
        errors="replace",
    )


def get_git_status(project_rel_path: str, workspace_root: Path) -> dict[str, Any]:
    project_dir = resolve_workspace_path(project_rel_path, workspace_root)
    if not (project_dir / ".git").exists():
        return {
            "initialized": False,
            "branch": None,
            "changes": [],
            "ahead_behind": "",
        }

    branch_res = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], project_dir)
    status_res = _run_git(["status", "--porcelain"], project_dir)
    changes = []
    for line in status_res.stdout.splitlines():
        if len(line) >= 4:
            changes.append({"code": line[:2].strip() or "M", "path": line[3:].strip()})

    return {
        "initialized": True,
        "branch": branch_res.stdout.strip() or "main",
        "changes": changes,
        "clean": len(changes) == 0,
    }


def init_git_repo(db: Session, project_rel_path: str, workspace_root: Path) -> dict[str, Any]:
    project_dir = resolve_workspace_path(project_rel_path, workspace_root)
    res = _run_git(["init", "-b", "main"], project_dir)
    record_audit_event(
        db,
        action="git.init",
        target_path=project_rel_path,
        status="success" if res.returncode == 0 else "error",
        details={"stderr": res.stderr.strip()},
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "Failed to initialize git repository.")
    return get_git_status(project_rel_path, workspace_root)


def get_git_diff(project_rel_path: str, workspace_root: Path) -> str:
    project_dir = resolve_workspace_path(project_rel_path, workspace_root)
    if not (project_dir / ".git").exists():
        return ""
    res = _run_git(["diff"], project_dir)
    staged = _run_git(["diff", "--cached"], project_dir)
    return "\n".join(part for part in [staged.stdout.strip(), res.stdout.strip()] if part)


def get_git_log(project_rel_path: str, workspace_root: Path, limit: int = 20) -> list[dict[str, str]]:
    project_dir = resolve_workspace_path(project_rel_path, workspace_root)
    if not (project_dir / ".git").exists():
        return []
    res = _run_git(
        ["log", f"-n{min(max(limit, 1), 50)}", "--pretty=format:%h|%an|%ad|%s", "--date=short"],
        project_dir,
    )
    if res.returncode != 0:
        return []
    commits = []
    for line in res.stdout.splitlines():
        parts = line.split("|", 3)
        if len(parts) == 4:
            commits.append(
                {"hash": parts[0], "author": parts[1], "date": parts[2], "message": parts[3]}
            )
    return commits


def get_git_branches(project_rel_path: str, workspace_root: Path) -> list[dict[str, Any]]:
    project_dir = resolve_workspace_path(project_rel_path, workspace_root)
    if not (project_dir / ".git").exists():
        return []
    res = _run_git(["branch", "--list"], project_dir)
    branches = []
    for line in res.stdout.splitlines():
        if not line.strip():
            continue
        is_current = line.startswith("*")
        name = line.lstrip("* ").strip()
        branches.append({"name": name, "current": is_current})
    return branches


def create_or_switch_branch(
    db: Session,
    *,
    project_rel_path: str,
    branch_name: str,
    create: bool,
    workspace_root: Path,
) -> dict[str, Any]:
    if not _SAFE_BRANCH_RE.match(branch_name) or ".." in branch_name:
        raise WorkspaceSecurityError("Invalid Git branch name.")
    project_dir = resolve_workspace_path(project_rel_path, workspace_root)
    args = ["checkout", "-b", branch_name] if create else ["checkout", branch_name]
    res = _run_git(args, project_dir)
    record_audit_event(
        db,
        action="git.branch",
        target_path=project_rel_path,
        status="success" if res.returncode == 0 else "error",
        details={"branch": branch_name, "create": create},
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "Failed to switch/create branch.")
    return {"branch": branch_name, "output": (res.stdout + res.stderr).strip()}


def create_git_commit(
    db: Session,
    *,
    project_rel_path: str,
    message: str,
    approved: bool,
    workspace_root: Path,
) -> dict[str, Any]:
    if not approved:
        return {
            "committed": False,
            "approval_required": True,
            "message": "Explicit user approval is required before creating a Git commit.",
        }
    clean_msg = message.strip()
    if not clean_msg:
        raise ValueError("Commit message cannot be empty.")

    project_dir = resolve_workspace_path(project_rel_path, workspace_root)
    add_res = _run_git(["add", "-A"], project_dir)
    if add_res.returncode != 0:
        raise RuntimeError(add_res.stderr.strip() or "git add failed.")

    # Ensure local repo has user identity configured if global git config is missing
    name_check = _run_git(["config", "user.name"], project_dir)
    if not name_check.stdout.strip():
        _run_git(["config", "user.name", "Vardhan Studio Developer"], project_dir)
        _run_git(["config", "user.email", "developer@vardhan-studio.local"], project_dir)

    commit_res = _run_git(["commit", "-m", clean_msg], project_dir)
    record_audit_event(
        db,
        action="git.commit",
        target_path=project_rel_path,
        status="success" if commit_res.returncode == 0 else "error",
        details={"message": clean_msg},
    )
    if commit_res.returncode != 0:
        raise RuntimeError((commit_res.stderr or commit_res.stdout).strip() or "git commit failed.")
    return {"committed": True, "output": commit_res.stdout.strip()}


def clone_github_repo(
    db: Session,
    *,
    repo_url: str,
    target_slug: str,
    approved: bool,
    workspace_root: Path,
) -> dict[str, Any]:
    if not approved:
        return {
            "cloned": False,
            "approval_required": True,
            "message": "Explicit user approval is required before cloning a remote repository.",
        }
    if not _SAFE_GIT_HTTPS_RE.match(repo_url.strip()):
        raise WorkspaceSecurityError(
            "Only clean public HTTPS repository URLs from github.com, gitlab.com, or bitbucket.org are allowed."
        )

    slug = validate_project_slug(target_slug)
    dest = resolve_workspace_path(slug, workspace_root)
    if dest.exists() and any(dest.iterdir()):
        raise FileExistsError(f"Target folder '{slug}' already exists and is not empty.")

    res = _run_git(["clone", "--depth", "1", repo_url.strip(), str(dest)], workspace_root, timeout=120)
    record_audit_event(
        db,
        action="git.clone",
        target_path=slug,
        status="success" if res.returncode == 0 else "error",
        details={"repo_url": repo_url.strip()},
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "git clone failed.")
    return {"cloned": True, "slug": slug, "output": (res.stdout + res.stderr).strip()}
