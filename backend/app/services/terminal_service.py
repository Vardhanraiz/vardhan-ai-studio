"""Sandboxed Windows PowerShell terminal runner with allowlists, risk checks, and audit logs."""

from __future__ import annotations

import re
import subprocess
import time
from pathlib import Path
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.security.audit import record_audit_event
from app.security.sandbox import WorkspaceSecurityError, resolve_workspace_path

RiskLevel = Literal["safe", "requires_approval", "blocked"]

_BLOCKED_PATTERNS = [
    re.compile(r"\bformat(\.com)?\s+[a-z]:", re.IGNORECASE),
    re.compile(r"\bdiskpart\b", re.IGNORECASE),
    re.compile(r"\b(shutdown|restart-computer|stop-computer)\b", re.IGNORECASE),
    re.compile(r"\breg\s+(delete|add)\b", re.IGNORECASE),
    re.compile(r"\b(remove-item|rm|del|rmdir)\b.*(\s/[sqf]|\s-recurse).*(c:\\|/|\\windows)", re.IGNORECASE),
    re.compile(r"\b(invoke-expression|iex)\s*\(", re.IGNORECASE),
    re.compile(r"\b(net\s+user|net\s+localgroup|bcdedit|cipher\s+/w)\b", re.IGNORECASE),
    re.compile(r"(&&|\|\||;)\s*(rm|del|format|shutdown)\b", re.IGNORECASE),
]

_SAFE_PREFIXES = (
    "git status",
    "git log",
    "git diff",
    "git branch",
    "git rev-parse",
    "python --version",
    "python -m pytest",
    "pytest",
    "node --version",
    "node --test",
    "npm --version",
    "npm.cmd --version",
    "npm test",
    "npm.cmd test",
    "npm run test",
    "npm.cmd run test",
    "npm run typecheck",
    "npm.cmd run typecheck",
    "npm run build",
    "npm.cmd run build",
    "dir",
    "ls",
    "pwd",
    "get-childitem",
    "get-location",
    "echo ",
    "write-output ",
)

# Disallow shell chaining in auto-safe mode so safe commands cannot smuggle extra commands
_CHAIN_OPERATORS = re.compile(r"[;&|`<>]|\$\(")


def classify_command(command: str) -> tuple[RiskLevel, str]:
    cmd = command.strip()
    if not cmd:
        return "blocked", "Empty command."

    for pattern in _BLOCKED_PATTERNS:
        if pattern.search(cmd):
            return "blocked", "Command matches a destructive or restricted system pattern."

    lowered = cmd.lower()
    if not _CHAIN_OPERATORS.search(cmd):
        for prefix in _SAFE_PREFIXES:
            if lowered == prefix or lowered.startswith(prefix + " ") or (
                prefix.endswith(" ") and lowered.startswith(prefix)
            ):
                return "safe", "Command is on the read/test safe allowlist."

    return (
        "requires_approval",
        "Command is not on the auto-safe allowlist and requires explicit user approval.",
    )


def run_sandboxed_command(
    db: Session,
    *,
    command: str,
    project_rel_path: str,
    workspace_root: Path,
    approved: bool = False,
    timeout_sec: int = 30,
    actor: str = "user",
) -> dict[str, Any]:
    cwd = resolve_workspace_path(project_rel_path, workspace_root)
    cwd.mkdir(parents=True, exist_ok=True)

    risk, reason = classify_command(command)

    if risk == "blocked":
        record_audit_event(
            db,
            action="terminal.blocked",
            actor=actor,
            target_path=project_rel_path,
            status="blocked",
            details={"command": command, "reason": reason},
        )
        raise WorkspaceSecurityError(f"Blocked terminal command: {reason}")

    if risk == "requires_approval" and not approved:
        record_audit_event(
            db,
            action="terminal.approval_requested",
            actor=actor,
            target_path=project_rel_path,
            status="pending_approval",
            details={"command": command, "reason": reason},
        )
        return {
            "executed": False,
            "approval_required": True,
            "risk_level": risk,
            "reason": reason,
            "command": command,
            "cwd": project_rel_path,
            "stdout": "",
            "stderr": "",
            "exit_code": None,
            "duration_ms": 0,
        }

    clamped_timeout = max(1, min(timeout_sec, 120))
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=clamped_timeout,
            encoding="utf-8",
            errors="replace",
        )
        duration_ms = int((time.perf_counter() - started) * 1000)
        result = {
            "executed": True,
            "approval_required": False,
            "risk_level": risk,
            "reason": reason,
            "command": command,
            "cwd": project_rel_path,
            "stdout": completed.stdout[:32000],
            "stderr": completed.stderr[:16000],
            "exit_code": completed.returncode,
            "duration_ms": duration_ms,
        }
        record_audit_event(
            db,
            action="terminal.execute",
            actor=actor,
            target_path=project_rel_path,
            status="success" if completed.returncode == 0 else "nonzero_exit",
            details={
                "command": command,
                "exit_code": completed.returncode,
                "approved": approved,
                "duration_ms": duration_ms,
            },
        )
        return result
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        record_audit_event(
            db,
            action="terminal.timeout",
            actor=actor,
            target_path=project_rel_path,
            status="timeout",
            details={"command": command, "timeout_sec": clamped_timeout},
        )
        return {
            "executed": True,
            "approval_required": False,
            "risk_level": risk,
            "reason": f"Command timed out after {clamped_timeout}s.",
            "command": command,
            "cwd": project_rel_path,
            "stdout": (exc.stdout or "")[:16000] if isinstance(exc.stdout, str) else "",
            "stderr": f"Command timed out after {clamped_timeout} seconds.",
            "exit_code": -1,
            "duration_ms": duration_ms,
        }
