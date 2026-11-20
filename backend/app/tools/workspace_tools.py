"""Sandboxed tools available to the Autonomous Coding Agent."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services import file_service, git_service


def tool_list_files(project_rel_path: str, workspace_root: Path, max_files: int = 80) -> list[str]:
    tree = file_service.build_file_tree(project_rel_path, workspace_root)
    flat: list[str] = []

    def _flatten(nodes: list[dict[str, Any]]) -> None:
        for node in nodes:
            if len(flat) >= max_files:
                return
            if node["type"] == "file":
                flat.append(node["path"])
            elif node.get("children"):
                _flatten(node["children"])

    _flatten(tree)
    return flat


def tool_read_file(
    project_rel_path: str,
    file_rel_path: str,
    workspace_root: Path,
    max_chars: int = 8000,
) -> dict[str, Any]:
    data = file_service.read_project_file(project_rel_path, file_rel_path, workspace_root)
    content = data["content"]
    truncated = len(content) > max_chars
    return {
        "path": data["path"],
        "language": data["language"],
        "content": content[:max_chars],
        "truncated": truncated,
    }


def tool_search_project(
    project_rel_path: str,
    query: str,
    workspace_root: Path,
    max_results: int = 25,
) -> list[dict[str, Any]]:
    return file_service.search_project_files(
        project_rel_path, query, workspace_root, max_results=max_results
    )


def tool_inspect_dependencies(project_rel_path: str, workspace_root: Path) -> dict[str, Any]:
    project_dir = file_service.get_project_root(project_rel_path, workspace_root)
    deps: dict[str, Any] = {"python": [], "node": [], "dotnet": [], "java": []}

    req_file = project_dir / "requirements.txt"
    if req_file.is_file():
        deps["python"] = [
            line.strip()
            for line in req_file.read_text(encoding="utf-8", errors="ignore").splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]

    pkg_file = project_dir / "package.json"
    if pkg_file.is_file():
        try:
            pkg = json.loads(pkg_file.read_text(encoding="utf-8", errors="ignore"))
            deps["node"] = sorted(
                set(list((pkg.get("dependencies") or {}).keys()) + list((pkg.get("devDependencies") or {}).keys()))
            )
        except json.JSONDecodeError:
            pass

    for csproj in project_dir.glob("*.csproj"):
        deps["dotnet"].append(csproj.name)

    if (project_dir / "pom.xml").is_file():
        deps["java"].append("pom.xml")

    return deps


def tool_git_status(project_rel_path: str, workspace_root: Path) -> dict[str, Any]:
    return git_service.get_git_status(project_rel_path, workspace_root)
