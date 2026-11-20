"""Sandboxed workspace file operations with backups, diffs, search, and audit logging."""

from __future__ import annotations

import difflib
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.security.audit import record_audit_event
from app.security.sandbox import WorkspaceSecurityError, resolve_workspace_path

IGNORED_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    "dist",
    "build",
    ".vite",
    ".next",
}

LANGUAGE_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".sql": "sql",
    ".cs": "csharp",
    ".java": "java",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "ini",
    ".ps1": "powershell",
    ".sh": "shell",
    ".xml": "xml",
    ".txt": "plaintext",
}


def detect_language(path: Path) -> str:
    return LANGUAGE_MAP.get(path.suffix.lower(), "plaintext")


def get_project_root(project_rel_path: str, workspace_root: Path) -> Path:
    project_dir = resolve_workspace_path(project_rel_path, workspace_root)
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir


def resolve_project_file(
    project_rel_path: str,
    file_rel_path: str,
    workspace_root: Path,
    *,
    allow_project_root: bool = False,
) -> Path:
    project_dir = get_project_root(project_rel_path, workspace_root)
    return resolve_workspace_path(file_rel_path, project_dir, allow_root=allow_project_root)


def compute_unified_diff(file_path: str, original: str, updated: str) -> str:
    diff_lines = difflib.unified_diff(
        original.splitlines(keepends=True),
        updated.splitlines(keepends=True),
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        lineterm="",
    )
    return "".join(diff_lines)


def create_backup(
    file_path: Path,
    project_slug: str,
    file_rel_path: str,
    backup_root: Path,
) -> str:
    """Create a timestamped reversible backup copy before modifying or deleting a file."""
    if not file_path.exists() or not file_path.is_file():
        return ""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file_rel_path.strip("/\\"))
    target_dir = (backup_root / project_slug).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    backup_file = target_dir / f"{timestamp}__{safe_name}.bak"
    shutil.copy2(file_path, backup_file)
    return str(backup_file.relative_to(backup_root.resolve()).as_posix())


def build_file_tree(
    project_rel_path: str,
    workspace_root: Path,
    max_depth: int = 8,
) -> list[dict[str, Any]]:
    project_dir = get_project_root(project_rel_path, workspace_root)

    def _walk(current: Path, depth: int) -> list[dict[str, Any]]:
        if depth > max_depth:
            return []
        entries: list[dict[str, Any]] = []
        try:
            children = sorted(
                current.iterdir(),
                key=lambda p: (not p.is_dir(), p.name.lower()),
            )
        except OSError:
            return []

        for child in children:
            if child.name in IGNORED_DIRS:
                continue
            rel = child.relative_to(project_dir).as_posix()
            if child.is_dir():
                entries.append(
                    {
                        "name": child.name,
                        "path": rel,
                        "type": "directory",
                        "children": _walk(child, depth + 1),
                    }
                )
            elif child.is_file():
                try:
                    size = child.stat().st_size
                except OSError:
                    size = 0
                entries.append(
                    {
                        "name": child.name,
                        "path": rel,
                        "type": "file",
                        "size": size,
                        "language": detect_language(child),
                    }
                )
        return entries

    return _walk(project_dir, 0)


def read_project_file(
    project_rel_path: str,
    file_rel_path: str,
    workspace_root: Path,
    max_file_size_kb: int = 1024,
) -> dict[str, Any]:
    target = resolve_project_file(project_rel_path, file_rel_path, workspace_root)
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(f"File not found: {file_rel_path}")

    size_bytes = target.stat().st_size
    if size_bytes > max_file_size_kb * 1024:
        raise ValueError(
            f"File exceeds maximum size limit ({max_file_size_kb} KB): {file_rel_path}"
        )

    content = target.read_text(encoding="utf-8", errors="replace")
    return {
        "path": file_rel_path.replace("\\", "/"),
        "content": content,
        "language": detect_language(target),
        "size": size_bytes,
    }


def create_project_entry(
    db: Session,
    *,
    project_rel_path: str,
    file_rel_path: str,
    entry_type: str,
    content: str,
    workspace_root: Path,
    actor: str = "user",
    overwrite: bool = False,
    backup_root: Path | None = None,
) -> dict[str, Any]:
    target = resolve_project_file(project_rel_path, file_rel_path, workspace_root)
    norm_path = file_rel_path.replace("\\", "/")

    if entry_type == "directory":
        target.mkdir(parents=True, exist_ok=True)
        record_audit_event(
            db,
            action="file.mkdir",
            actor=actor,
            target_path=f"{project_rel_path}/{norm_path}",
            status="success",
        )
        return {"path": norm_path, "type": "directory", "created": True}

    if target.exists() and not overwrite:
        raise FileExistsError(f"File already exists: {norm_path}")

    backup_rel = ""
    if target.exists() and backup_root is not None:
        backup_rel = create_backup(target, project_rel_path, norm_path, backup_root)

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")

    record_audit_event(
        db,
        action="file.create",
        actor=actor,
        target_path=f"{project_rel_path}/{norm_path}",
        status="success",
        details={"bytes": len(content.encode("utf-8")), "backup": backup_rel},
    )
    return {
        "path": norm_path,
        "type": "file",
        "language": detect_language(target),
        "size": target.stat().st_size,
        "backup_path": backup_rel,
    }


def save_project_file(
    db: Session,
    *,
    project_rel_path: str,
    file_rel_path: str,
    content: str,
    workspace_root: Path,
    backup_root: Path,
    actor: str = "user",
) -> dict[str, Any]:
    target = resolve_project_file(project_rel_path, file_rel_path, workspace_root)
    norm_path = file_rel_path.replace("\\", "/")

    original = target.read_text(encoding="utf-8", errors="replace") if target.exists() else ""
    backup_rel = create_backup(target, project_rel_path, norm_path, backup_root) if target.exists() else ""
    diff_text = compute_unified_diff(norm_path, original, content)

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")

    record_audit_event(
        db,
        action="file.save",
        actor=actor,
        target_path=f"{project_rel_path}/{norm_path}",
        status="success",
        details={"bytes": len(content.encode("utf-8")), "backup": backup_rel},
    )
    return {
        "path": norm_path,
        "language": detect_language(target),
        "size": target.stat().st_size,
        "backup_path": backup_rel,
        "unified_diff": diff_text,
    }


def delete_project_entry(
    db: Session,
    *,
    project_rel_path: str,
    file_rel_path: str,
    workspace_root: Path,
    backup_root: Path,
    actor: str = "user",
) -> dict[str, Any]:
    target = resolve_project_file(project_rel_path, file_rel_path, workspace_root)
    norm_path = file_rel_path.replace("\\", "/")
    if not target.exists():
        raise FileNotFoundError(f"Path not found: {norm_path}")

    backup_rel = ""
    if target.is_file():
        backup_rel = create_backup(target, project_rel_path, norm_path, backup_root)
        target.unlink()
    elif target.is_dir():
        shutil.rmtree(target)

    record_audit_event(
        db,
        action="file.delete",
        actor=actor,
        target_path=f"{project_rel_path}/{norm_path}",
        status="success",
        details={"backup": backup_rel},
    )
    return {"path": norm_path, "deleted": True, "backup_path": backup_rel}


def restore_backup_file(
    db: Session,
    *,
    project_rel_path: str,
    file_rel_path: str,
    backup_rel_path: str,
    workspace_root: Path,
    backup_root: Path,
    actor: str = "user",
) -> dict[str, Any]:
    target = resolve_project_file(project_rel_path, file_rel_path, workspace_root)
    backup_file = resolve_workspace_path(backup_rel_path, backup_root)
    if not backup_file.exists() or not backup_file.is_file():
        raise FileNotFoundError("Requested backup file does not exist.")

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(backup_file, target)

    record_audit_event(
        db,
        action="file.restore_backup",
        actor=actor,
        target_path=f"{project_rel_path}/{file_rel_path}",
        status="success",
        details={"backup": backup_rel_path},
    )
    return {"path": file_rel_path, "restored_from": backup_rel_path}


def search_project_files(
    project_rel_path: str,
    query: str,
    workspace_root: Path,
    *,
    case_sensitive: bool = False,
    max_results: int = 100,
) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    project_dir = get_project_root(project_rel_path, workspace_root)
    needle = query if case_sensitive else query.lower()
    matches: list[dict[str, Any]] = []

    for root_str, dirs, files in os.walk(project_dir):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for fname in files:
            fpath = Path(root_str) / fname
            try:
                if fpath.stat().st_size > 512 * 1024:
                    continue
                text = fpath.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue

            rel = fpath.relative_to(project_dir).as_posix()
            for idx, line in enumerate(text.splitlines(), start=1):
                haystack = line if case_sensitive else line.lower()
                if needle in haystack:
                    matches.append(
                        {
                            "path": rel,
                            "line": idx,
                            "preview": line.strip()[:240],
                        }
                    )
                    if len(matches) >= max_results:
                        return matches
    return matches
