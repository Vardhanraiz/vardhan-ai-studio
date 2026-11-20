"""Workspace sandboxing and path traversal protection for Windows and POSIX."""

from __future__ import annotations

import os
import re
from pathlib import Path

_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

_SAFE_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,62}$")


class WorkspaceSecurityError(ValueError):
    """Raised when a requested path violates workspace sandboxing rules."""


def validate_project_slug(slug: str) -> str:
    """Validate and normalize a safe workspace directory slug."""
    normalized = slug.strip().lower()
    if not _SAFE_SLUG_RE.match(normalized):
        raise WorkspaceSecurityError(
            "Project slug must be 2-63 lowercase alphanumeric characters, hyphens, or underscores."
        )
    if normalized.upper() in _WINDOWS_RESERVED_NAMES:
        raise WorkspaceSecurityError(f"Reserved Windows device name is not allowed: {slug}")
    return normalized


def _validate_path_segments(raw_path: str) -> None:
    if "\x00" in raw_path:
        raise WorkspaceSecurityError("Null bytes are not allowed in paths.")

    if raw_path.startswith("\\\\") or raw_path.startswith("//"):
        raise WorkspaceSecurityError("UNC or network share paths are blocked.")

    # Inspect individual segments before resolution
    parts = re.split(r"[\\/]+", raw_path)
    for part in parts:
        if not part:
            continue
        if part == "..":
            raise WorkspaceSecurityError("Parent directory traversal ('..') is blocked.")
        stem = part.split(".")[0].upper()
        if stem in _WINDOWS_RESERVED_NAMES:
            raise WorkspaceSecurityError(f"Windows reserved device name is blocked: {part}")


def resolve_workspace_path(
    target_path: str | Path,
    workspace_root: Path,
    *,
    allow_root: bool = False,
) -> Path:
    """Resolve `target_path` strictly inside `workspace_root`.

    Blocks `..` traversal, absolute escapes, UNC paths, Windows reserved names,
    null bytes, and symlink escapes pointing outside `workspace_root`.
    """
    raw_str = str(target_path).strip()
    root_resolved = workspace_root.resolve()

    if not raw_str or raw_str in {".", "./", ".\\"}:
        if allow_root:
            return root_resolved
        raise WorkspaceSecurityError("Target path must not be empty or workspace root.")

    _validate_path_segments(raw_str)

    candidate = Path(raw_str)
    if candidate.is_absolute():
        resolved = candidate.resolve()
    else:
        resolved = (root_resolved / candidate).resolve()

    try:
        resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise WorkspaceSecurityError("Resolved path escapes the configured workspace sandbox.") from exc

    # Explicitly check intermediate symlink components to prevent symlink escapes
    current = root_resolved
    rel_parts = resolved.relative_to(root_resolved).parts
    for part in rel_parts:
        current = current / part
        if current.is_symlink():
            link_target = current.resolve()
            try:
                link_target.relative_to(root_resolved)
            except ValueError as exc:
                raise WorkspaceSecurityError("Symlink target escapes the workspace sandbox.") from exc

    if not allow_root and resolved == root_resolved:
        raise WorkspaceSecurityError("Direct operation on workspace root is not permitted.")

    # Extra case-insensitive guard for Windows drive/path normalization
    common = os.path.commonpath([str(root_resolved), str(resolved)])
    if Path(common).resolve() != root_resolved:
        raise WorkspaceSecurityError("Path common root mismatch outside workspace sandbox.")

    return resolved
