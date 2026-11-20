"""AI Testing Agent: framework detection, approved test execution, result parsing, and test generation."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import Project
from app.services import ai_service, file_service, terminal_service

_PYTEST_SUMMARY_RE = re.compile(r"(\d+)\s+passed", re.IGNORECASE)
_PYTEST_FAILED_RE = re.compile(r"(\d+)\s+failed", re.IGNORECASE)
_VITEST_PASSED_RE = re.compile(r"Tests\s+.*?(\d+)\s+passed", re.IGNORECASE)
_VITEST_FAILED_RE = re.compile(r"Tests\s+.*?(\d+)\s+failed", re.IGNORECASE)
_NODE_PASS_RE = re.compile(r"pass\s+(\d+)", re.IGNORECASE)
_NODE_FAIL_RE = re.compile(r"fail\s+(\d+)", re.IGNORECASE)


def detect_test_frameworks(project_rel_path: str, workspace_root: Path) -> list[dict[str, str]]:
    project_dir = file_service.get_project_root(project_rel_path, workspace_root)
    detected: list[dict[str, str]] = []

    has_py_tests = any(project_dir.rglob("test_*.py")) or any(project_dir.rglob("*_test.py"))
    if has_py_tests or (project_dir / "pytest.ini").exists() or (project_dir / "requirements.txt").exists():
        detected.append(
            {
                "framework": "pytest",
                "command": f'"{sys.executable}" -m pytest -v',
                "type": "unit / integration (Python)",
            }
        )

    pkg_path = project_dir / "package.json"
    if pkg_path.is_file():
        try:
            pkg = json.loads(pkg_path.read_text(encoding="utf-8", errors="ignore"))
            all_deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
            scripts = pkg.get("scripts") or {}
            if "vitest" in all_deps or "test" in scripts:
                detected.append(
                    {
                        "framework": "vitest" if "vitest" in all_deps else "npm-test",
                        "command": "npm.cmd test",
                        "type": "unit / component (Frontend)",
                    }
                )
            if "@playwright/test" in all_deps or "playwright" in all_deps:
                detected.append(
                    {
                        "framework": "playwright",
                        "command": "npx.cmd playwright test",
                        "type": "browser e2e",
                    }
                )
        except json.JSONDecodeError:
            pass

    if any(project_dir.rglob("*.test.mjs")) or any(project_dir.rglob("*.test.js")):
        detected.append(
            {
                "framework": "node-test",
                "command": "node --test",
                "type": "unit (Node.js)",
            }
        )

    return detected


def parse_test_output(framework: str, stdout: str, stderr: str, exit_code: int | None) -> dict[str, Any]:
    combined = f"{stdout}\n{stderr}"
    passed = 0
    failed = 0

    if framework == "pytest":
        m_pass = _PYTEST_SUMMARY_RE.search(combined)
        m_fail = _PYTEST_FAILED_RE.search(combined)
        passed = int(m_pass.group(1)) if m_pass else 0
        failed = int(m_fail.group(1)) if m_fail else 0
    elif framework in {"vitest", "npm-test"}:
        m_pass = _VITEST_PASSED_RE.search(combined)
        m_fail = _VITEST_FAILED_RE.search(combined)
        passed = int(m_pass.group(1)) if m_pass else 0
        failed = int(m_fail.group(1)) if m_fail else 0
    elif framework == "node-test":
        m_pass = _NODE_PASS_RE.search(combined)
        m_fail = _NODE_FAIL_RE.search(combined)
        passed = int(m_pass.group(1)) if m_pass else 0
        failed = int(m_fail.group(1)) if m_fail else 0

    status = "passed" if exit_code == 0 and failed == 0 else "failed"
    return {
        "framework": framework,
        "status": status,
        "passed": passed,
        "failed": failed,
        "exit_code": exit_code,
    }


def run_project_tests(
    db: Session,
    *,
    project: Project,
    framework: str,
    command: str,
    approved: bool,
    settings: Settings,
) -> dict[str, Any]:
    exec_result = terminal_service.run_sandboxed_command(
        db,
        command=command,
        project_rel_path=project.relative_path,
        workspace_root=settings.workspace_root,
        approved=approved,
        timeout_sec=90,
        actor="testing_agent",
    )
    if exec_result.get("approval_required"):
        return {**exec_result, "report": None}

    report = parse_test_output(
        framework,
        exec_result.get("stdout", ""),
        exec_result.get("stderr", ""),
        exec_result.get("exit_code"),
    )
    return {**exec_result, "report": report}


async def generate_tests_for_file(
    db: Session,
    *,
    project: Project,
    target_file: str,
    test_type: str,
    settings: Settings,
    model_override: str | None = None,
) -> dict[str, Any]:
    file_data = file_service.read_project_file(
        project.relative_path, target_file, settings.workspace_root
    )
    model_cfg = ai_service.get_model_config(db, settings)
    context_block = ai_service.format_untrusted_context(
        [{"path": file_data["path"], "content": file_data["content"][:5000]}]
    )

    framework_hint = {
        "unit": "Pytest (for Python) or Vitest (for JS/TS)",
        "integration": "Pytest + FastAPI TestClient or Vitest integration tests",
        "browser": "Playwright end-to-end browser test (@playwright/test)",
    }.get(test_type, "Pytest or Vitest")

    prompt = (
        f"Generate clean, runnable {test_type} tests using {framework_hint} for the file below.\n"
        "Include edge cases, clear assertions, and no placeholder TODOs.\n\n"
        f"{context_block}"
    )

    try:
        generated = await ai_service.generate_complete_response(
            messages=[{"role": "user", "content": prompt}],
            config=model_cfg,
            settings=settings,
            model_override=model_override,
        )
        return {
            "target_file": target_file,
            "test_type": test_type,
            "ai_available": True,
            "generated_tests": generated,
            "error": None,
        }
    except ai_service.AIProviderError as exc:
        return {
            "target_file": target_file,
            "test_type": test_type,
            "ai_available": False,
            "generated_tests": "",
            "error": str(exc),
        }
