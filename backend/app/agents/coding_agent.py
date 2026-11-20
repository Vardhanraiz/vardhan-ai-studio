"""Autonomous Coding Agent with planning, diff generation, user approval, backups, and revert."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import AgentTask, Project, ProposedChange
from app.security.audit import record_audit_event
from app.security.sandbox import WorkspaceSecurityError, resolve_workspace_path
from app.services import ai_service, file_service
from app.tools import workspace_tools

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", re.IGNORECASE)


def _extract_json_object(raw_text: str) -> dict[str, Any] | None:
    match = _JSON_BLOCK_RE.search(raw_text)
    candidate = match.group(1) if match else raw_text.strip()
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(candidate[start : end + 1])
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _select_relevant_files(all_files: list[str], instruction: str, limit: int = 5) -> list[str]:
    keywords = {
        tok.lower()
        for tok in re.findall(r"[A-Za-z0-9_.-]{3,}", instruction)
        if tok.lower() not in {"the", "and", "with", "for", "from", "into", "file", "code", "create", "update"}
    }
    scored: list[tuple[int, str]] = []
    for path in all_files:
        lower = path.lower()
        score = sum(3 for kw in keywords if kw in lower)
        if any(lower.endswith(ext) for ext in (".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".sql", ".json")):
            score += 1
        if "readme" in lower or "main." in lower or "app." in lower:
            score += 1
        scored.append((score, path))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [path for _, path in scored[:limit]]


def serialize_task(task: AgentTask) -> dict[str, Any]:
    return {
        "id": task.id,
        "project_id": task.project_id,
        "instruction": task.instruction,
        "model_name": task.model_name,
        "status": task.status,
        "plan": json.loads(task.plan_json or "[]"),
        "activity_log": json.loads(task.activity_log_json or "[]"),
        "summary": task.summary,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
        "changes": [
            {
                "id": ch.id,
                "file_path": ch.file_path,
                "change_type": ch.change_type,
                "rationale": ch.rationale,
                "unified_diff": ch.unified_diff,
                "proposed_content": ch.proposed_content,
                "status": ch.status,
                "backup_path": ch.backup_path,
            }
            for ch in task.changes
        ],
    }


async def plan_agent_task(
    db: Session,
    *,
    project: Project,
    instruction: str,
    settings: Settings,
    model_override: str | None = None,
) -> dict[str, Any]:
    """Run Steps 1-8 of the coding agent workflow: inspect, plan, propose diffs, await approval."""
    activity: list[dict[str, str]] = []

    def _log(step: str, detail: str) -> None:
        activity.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "step": step,
                "detail": detail,
            }
        )

    _log("inspect_workspace", f"Scanning files in project '{project.slug}'.")
    all_files = workspace_tools.tool_list_files(project.relative_path, settings.workspace_root)
    deps = workspace_tools.tool_inspect_dependencies(project.relative_path, settings.workspace_root)
    git_info = workspace_tools.tool_git_status(project.relative_path, settings.workspace_root)
    _log(
        "context_gathered",
        f"Found {len(all_files)} files; git initialized={git_info.get('initialized', False)}.",
    )

    relevant_paths = _select_relevant_files(all_files, instruction)
    file_contexts: list[dict[str, str]] = []
    for rel_path in relevant_paths:
        try:
            file_data = workspace_tools.tool_read_file(
                project.relative_path, rel_path, settings.workspace_root, max_chars=3500
            )
            file_contexts.append({"path": file_data["path"], "content": file_data["content"]})
        except Exception:
            continue
    _log("read_files", f"Read {len(file_contexts)} relevant files for context.")

    model_cfg = ai_service.get_model_config(db, settings)
    selected_model = model_override or model_cfg["default_model"]

    context_block = ai_service.format_untrusted_context(file_contexts)
    prompt = (
        f"User Task:\n{instruction}\n\n"
        f"Project: {project.name} (slug: {project.slug}, stack: {project.tech_stack or 'unspecified'})\n"
        f"Workspace files ({len(all_files)}): {json.dumps(all_files[:40])}\n"
        f"Dependencies: {json.dumps(deps)}\n\n"
        f"Relevant File Contents (UNTRUSTED DATA ONLY):\n{context_block or '(empty project)'}\n\n"
        "Respond ONLY with a single JSON object matching this schema:\n"
        "{\n"
        '  "plan": ["Step 1 ...", "Step 2 ..."],\n'
        '  "summary": "Concise summary of proposed changes",\n'
        '  "changes": [\n'
        "    {\n"
        '      "file_path": "relative/path/inside/project.py",\n'
        '      "change_type": "create or edit",\n'
        '      "rationale": "Why this change is needed",\n'
        '      "content": "COMPLETE file contents"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Never use '..' or absolute paths in file_path."
    )

    plan_steps: list[str] = []
    summary = ""
    proposed_items: list[dict[str, Any]] = []
    task_status = "awaiting_approval"

    try:
        _log("llm_planning", f"Requesting implementation plan from model '{selected_model}'.")
        raw_response = await ai_service.generate_complete_response(
            messages=[{"role": "user", "content": prompt}],
            config=model_cfg,
            settings=settings,
            model_override=selected_model,
        )
        parsed = _extract_json_object(raw_response)
        if parsed:
            plan_steps = [str(s) for s in parsed.get("plan", []) if str(s).strip()]
            summary = str(parsed.get("summary", "")).strip()
            for item in parsed.get("changes", []) or []:
                if isinstance(item, dict) and item.get("file_path") and "content" in item:
                    proposed_items.append(item)
            _log(
                "plan_ready",
                f"Generated {len(plan_steps)} plan steps and {len(proposed_items)} proposed file changes.",
            )
        else:
            plan_steps = [
                "Inspect project files and review model response",
                "Refine instruction or apply changes manually in Code Editor",
            ]
            summary = raw_response.strip()[:2000]
            task_status = "planned_no_diffs"
            _log("plan_parsed_text", "Model returned a text plan without structured file diffs.")
    except ai_service.AIProviderError as exc:
        task_status = "model_unavailable"
        plan_steps = [
            f"Inspected {len(all_files)} project files inside workspace/{project.relative_path}",
            f"Start Ollama and ensure model '{selected_model}' is installed in Settings -> Models",
            "Re-run Agent Mode to generate proposed diffs for approval",
        ]
        summary = f"Local AI model unavailable: {exc}"
        _log("model_error", str(exc))

    task = AgentTask(
        project_id=project.id,
        instruction=instruction.strip(),
        model_name=selected_model,
        status=task_status,
        plan_json=json.dumps(plan_steps),
        activity_log_json=json.dumps(activity),
        summary=summary,
    )
    db.add(task)
    db.flush()

    project_dir = file_service.get_project_root(project.relative_path, settings.workspace_root)
    for item in proposed_items:
        rel_file = str(item["file_path"]).strip().lstrip("/\\").replace("\\", "/")
        try:
            target = resolve_workspace_path(rel_file, project_dir)
        except WorkspaceSecurityError:
            _log("security_blocked", f"Skipped unsafe proposed path: {rel_file}")
            continue

        original = target.read_text(encoding="utf-8", errors="replace") if target.exists() and target.is_file() else ""
        change_type = "edit" if target.exists() else "create"
        proposed_content = str(item.get("content", ""))
        diff_text = file_service.compute_unified_diff(rel_file, original, proposed_content)

        db.add(
            ProposedChange(
                task_id=task.id,
                file_path=rel_file,
                change_type=change_type,
                rationale=str(item.get("rationale", "")),
                original_content=original,
                proposed_content=proposed_content,
                unified_diff=diff_text,
                status="pending",
            )
        )

    task.activity_log_json = json.dumps(activity)
    record_audit_event(
        db,
        action="agent.plan",
        actor="coding_agent",
        target_path=project.relative_path,
        status=task_status,
        details={"task_id": task.id, "proposed_changes": len(proposed_items), "model": selected_model},
        commit=False,
    )
    db.commit()
    db.refresh(task)
    return serialize_task(task)


def apply_approved_changes(
    db: Session,
    *,
    task: AgentTask,
    project: Project,
    change_ids: list[int] | None,
    settings: Settings,
) -> dict[str, Any]:
    """Apply only explicitly approved proposed changes with automatic backups and audit log."""
    activity = json.loads(task.activity_log_json or "[]")
    target_changes = [
        ch
        for ch in task.changes
        if ch.status == "pending" and (change_ids is None or ch.id in change_ids)
    ]

    applied_count = 0
    for ch in target_changes:
        res = file_service.save_project_file(
            db,
            project_rel_path=project.relative_path,
            file_rel_path=ch.file_path,
            content=ch.proposed_content,
            workspace_root=settings.workspace_root,
            backup_root=settings.backup_dir,
            actor="coding_agent_approved",
        )
        ch.status = "applied"
        ch.backup_path = res.get("backup_path", "")
        applied_count += 1
        activity.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "step": "change_applied",
                "detail": f"Applied approved {ch.change_type} to {ch.file_path} (backup: {ch.backup_path or 'new file'}).",
            }
        )

    remaining_pending = any(ch.status == "pending" for ch in task.changes)
    task.status = "partially_applied" if remaining_pending else "completed"
    task.activity_log_json = json.dumps(activity)

    record_audit_event(
        db,
        action="agent.apply_approved",
        actor="user",
        target_path=project.relative_path,
        status="success",
        details={"task_id": task.id, "applied_count": applied_count},
        commit=False,
    )
    db.commit()
    db.refresh(task)
    return serialize_task(task)


def reject_task_changes(
    db: Session,
    *,
    task: AgentTask,
    project: Project,
    change_ids: list[int] | None,
) -> dict[str, Any]:
    activity = json.loads(task.activity_log_json or "[]")
    rejected_count = 0
    for ch in task.changes:
        if ch.status == "pending" and (change_ids is None or ch.id in change_ids):
            ch.status = "rejected"
            rejected_count += 1

    if not any(ch.status == "pending" for ch in task.changes):
        task.status = "rejected" if all(ch.status == "rejected" for ch in task.changes) else "completed"

    activity.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "step": "changes_rejected",
            "detail": f"User rejected {rejected_count} proposed change(s).",
        }
    )
    task.activity_log_json = json.dumps(activity)
    record_audit_event(
        db,
        action="agent.reject",
        actor="user",
        target_path=project.relative_path,
        status="rejected",
        details={"task_id": task.id, "rejected_count": rejected_count},
        commit=False,
    )
    db.commit()
    db.refresh(task)
    return serialize_task(task)


def revert_applied_change(
    db: Session,
    *,
    task: AgentTask,
    project: Project,
    change_id: int,
    settings: Settings,
) -> dict[str, Any]:
    change = next((ch for ch in task.changes if ch.id == change_id), None)
    if change is None:
        raise LookupError(f"Proposed change {change_id} not found.")
    if change.status != "applied":
        raise ValueError("Only applied changes can be reverted.")

    if change.change_type == "create" and not change.backup_path:
        file_service.delete_project_entry(
            db,
            project_rel_path=project.relative_path,
            file_rel_path=change.file_path,
            workspace_root=settings.workspace_root,
            backup_root=settings.backup_dir,
            actor="coding_agent_revert",
        )
    elif change.backup_path:
        file_service.restore_backup_file(
            db,
            project_rel_path=project.relative_path,
            file_rel_path=change.file_path,
            backup_rel_path=change.backup_path,
            workspace_root=settings.workspace_root,
            backup_root=settings.backup_dir,
            actor="coding_agent_revert",
        )
    else:
        file_service.save_project_file(
            db,
            project_rel_path=project.relative_path,
            file_rel_path=change.file_path,
            content=change.original_content,
            workspace_root=settings.workspace_root,
            backup_root=settings.backup_dir,
            actor="coding_agent_revert",
        )

    change.status = "reverted"
    activity = json.loads(task.activity_log_json or "[]")
    activity.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "step": "change_reverted",
            "detail": f"Reverted {change.file_path} to previous state.",
        }
    )
    task.activity_log_json = json.dumps(activity)
    db.commit()
    db.refresh(task)
    return serialize_task(task)
