"""AI Debugging Assistant: parses stack traces, loads project context, and suggests fixes."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import Project
from app.services import ai_service, file_service

_PYTHON_FRAME_RE = re.compile(r'File "([^"]+)", line (\d+)(?:, in ([^\r\n]+))?')
_JS_FRAME_RE = re.compile(r"at\s+(?:([^\s(]+)\s+\()?([^():\r\n]+):(\d+):(\d+)\)?")
_TS_ERROR_RE = re.compile(r"([^\s(]+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+([^\r\n]+)")
_HTTP_ERROR_RE = re.compile(r"\b(4\d{2}|5\d{2})\b.*(Unauthorized|Forbidden|Not Found|Internal Server Error|Bad Request|Unprocessable)", re.IGNORECASE)
_SQL_ERROR_RE = re.compile(r"(sqlite3\.\w+Error|OperationalError|IntegrityError|SyntaxError|FOREIGN KEY constraint failed|no such table:[^\r\n]+)", re.IGNORECASE)


def parse_error_trace(error_text: str) -> dict[str, Any]:
    """Deterministically detect error type and extract stack frames/file references."""
    category = "general"
    frames: list[dict[str, Any]] = []
    highlights: list[str] = []

    if "Traceback (most recent call last):" in error_text or _PYTHON_FRAME_RE.search(error_text):
        category = "python"
        for m in _PYTHON_FRAME_RE.finditer(error_text):
            frames.append({"file": m.group(1), "line": int(m.group(2)), "symbol": (m.group(3) or "").strip()})

    ts_matches = list(_TS_ERROR_RE.finditer(error_text))
    if ts_matches:
        category = "typescript"
        for m in ts_matches:
            frames.append({"file": m.group(1), "line": int(m.group(2)), "symbol": m.group(4)})
            highlights.append(f"{m.group(4)}: {m.group(5)}")

    if category == "general" and _JS_FRAME_RE.search(error_text):
        category = "react" if "React" in error_text or ".tsx" in error_text or ".jsx" in error_text else "javascript"
        for m in _JS_FRAME_RE.finditer(error_text):
            frames.append({"file": m.group(2), "line": int(m.group(3)), "symbol": (m.group(1) or "").strip()})

    if _SQL_ERROR_RE.search(error_text):
        category = "database"
        highlights.extend(m.group(0) for m in _SQL_ERROR_RE.finditer(error_text))
    elif _HTTP_ERROR_RE.search(error_text) and category == "general":
        category = "api"
        highlights.extend(m.group(0) for m in _HTTP_ERROR_RE.finditer(error_text))

    lines = [ln.strip() for ln in error_text.strip().splitlines() if ln.strip()]
    primary_message = lines[-1] if lines else ""

    return {
        "category": category,
        "primary_message": primary_message,
        "frames": frames[:15],
        "highlights": highlights[:10],
    }


async def analyze_error(
    db: Session,
    *,
    error_text: str,
    project: Project | None,
    file_path: str | None,
    settings: Settings,
    model_override: str | None = None,
) -> dict[str, Any]:
    parsed = parse_error_trace(error_text)
    source_snippet = ""
    resolved_file = file_path or ""

    if project is not None and resolved_file:
        try:
            data = file_service.read_project_file(
                project.relative_path, resolved_file, settings.workspace_root
            )
            source_snippet = data["content"][:5000]
        except Exception:
            source_snippet = ""

    ai_analysis = ""
    ai_available = True
    ai_error = None

    model_cfg = ai_service.get_model_config(db, settings)
    context_block = (
        ai_service.format_untrusted_context([{"path": resolved_file, "content": source_snippet}])
        if source_snippet
        else ""
    )

    prompt = (
        f"Analyze this {parsed['category']} error and provide:\n"
        "1. Likely root cause(s)\n"
        "2. Step-by-step fix explanation\n"
        "3. Before-and-after code fix\n"
        "4. Suggested verification test command\n\n"
        f"Error / Stack Trace:\n```\n{error_text[:6000]}\n```\n"
        f"{context_block}"
    )

    try:
        ai_analysis = await ai_service.generate_complete_response(
            messages=[{"role": "user", "content": prompt}],
            config=model_cfg,
            settings=settings,
            model_override=model_override,
        )
    except ai_service.AIProviderError as exc:
        ai_available = False
        ai_error = str(exc)

    return {
        "parsed": parsed,
        "file_path": resolved_file,
        "has_source_context": bool(source_snippet),
        "ai_available": ai_available,
        "ai_analysis": ai_analysis,
        "ai_error": ai_error,
    }
