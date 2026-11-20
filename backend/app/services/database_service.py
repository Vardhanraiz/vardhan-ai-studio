"""SQLite Database Assistant: schema inspection, relationships, safe queries, and CRUD SQL."""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.security.audit import record_audit_event
from app.security.sandbox import WorkspaceSecurityError, resolve_workspace_path
from app.services import file_service

_READ_ONLY_SQL_RE = re.compile(r"^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b", re.IGNORECASE)
_DANGEROUS_SQL_RE = re.compile(r"\b(ATTACH\s+DATABASE|LOAD_EXTENSION)\b", re.IGNORECASE)


def list_sqlite_databases(project_rel_path: str, workspace_root: Path) -> list[dict[str, Any]]:
    project_dir = file_service.get_project_root(project_rel_path, workspace_root)
    dbs: list[dict[str, Any]] = []
    for ext in ("*.db", "*.sqlite", "*.sqlite3"):
        for db_path in project_dir.rglob(ext):
            if any(part in file_service.IGNORED_DIRS for part in db_path.parts):
                continue
            rel = db_path.relative_to(project_dir).as_posix()
            dbs.append({"path": rel, "size_bytes": db_path.stat().st_size})
    dbs.sort(key=lambda item: item["path"])
    return dbs


def _resolve_db_file(project_rel_path: str, db_rel_path: str, workspace_root: Path) -> Path:
    project_dir = file_service.get_project_root(project_rel_path, workspace_root)
    resolved = resolve_workspace_path(db_rel_path, project_dir)
    if resolved.suffix.lower() not in {".db", ".sqlite", ".sqlite3"}:
        raise WorkspaceSecurityError("Database file must have .db, .sqlite, or .sqlite3 extension.")
    return resolved


def inspect_sqlite_schema(
    project_rel_path: str,
    db_rel_path: str,
    workspace_root: Path,
) -> dict[str, Any]:
    db_file = _resolve_db_file(project_rel_path, db_rel_path, workspace_root)
    if not db_file.exists():
        raise FileNotFoundError(f"SQLite database not found: {db_rel_path}")

    conn = sqlite3.connect(str(db_file))
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        tables_raw = cur.execute(
            "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()

        tables: list[dict[str, Any]] = []
        relationships: list[dict[str, str]] = []

        for tbl in tables_raw:
            table_name = tbl["name"]
            quoted = f'"{table_name.replace(chr(34), chr(34) * 2)}"'
            cols_raw = cur.execute(f"PRAGMA table_info({quoted})").fetchall()
            fks_raw = cur.execute(f"PRAGMA foreign_key_list({quoted})").fetchall()
            row_count = cur.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]

            columns = [
                {
                    "name": c["name"],
                    "type": c["type"] or "TEXT",
                    "notnull": bool(c["notnull"]),
                    "default": c["dflt_value"],
                    "primary_key": bool(c["pk"]),
                }
                for c in cols_raw
            ]
            for fk in fks_raw:
                relationships.append(
                    {
                        "from_table": table_name,
                        "from_column": fk["from"],
                        "to_table": fk["table"],
                        "to_column": fk["to"] or "id",
                    }
                )

            tables.append(
                {
                    "name": table_name,
                    "row_count": row_count,
                    "columns": columns,
                    "create_sql": tbl["sql"] or "",
                }
            )

        return {
            "database": db_rel_path,
            "table_count": len(tables),
            "tables": tables,
            "relationships": relationships,
        }
    finally:
        conn.close()


def execute_sqlite_query(
    db: Session,
    *,
    project_rel_path: str,
    db_rel_path: str,
    sql: str,
    approved: bool,
    workspace_root: Path,
    create_if_missing: bool = False,
) -> dict[str, Any]:
    clean_sql = sql.strip()
    if not clean_sql:
        raise ValueError("SQL query cannot be empty.")

    if _DANGEROUS_SQL_RE.search(clean_sql):
        raise WorkspaceSecurityError("ATTACH DATABASE and LOAD_EXTENSION are blocked for security.")

    db_file = _resolve_db_file(project_rel_path, db_rel_path, workspace_root)
    if not db_file.exists() and not create_if_missing:
        raise FileNotFoundError(f"SQLite database not found: {db_rel_path}")

    is_read_only = bool(_READ_ONLY_SQL_RE.match(clean_sql)) and ";" not in clean_sql.rstrip(";")
    if not is_read_only and not approved:
        return {
            "executed": False,
            "approval_required": True,
            "reason": "Write/DDL SQL statements require explicit user approval.",
            "columns": [],
            "rows": [],
            "row_count": 0,
        }

    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        cur = conn.cursor()
        if is_read_only:
            cur.execute(clean_sql)
            columns = [desc[0] for desc in (cur.description or [])]
            fetched = cur.fetchmany(200)
            rows = [list(r) for r in fetched]
            row_count = len(rows)
        else:
            cur.executescript(clean_sql)
            conn.commit()
            columns = []
            rows = []
            row_count = cur.rowcount if cur.rowcount != -1 else 0

        record_audit_event(
            db,
            action="database.query",
            target_path=f"{project_rel_path}/{db_rel_path}",
            status="success",
            details={"read_only": is_read_only, "approved": approved, "sql_preview": clean_sql[:200]},
        )
        return {
            "executed": True,
            "approval_required": False,
            "read_only": is_read_only,
            "columns": columns,
            "rows": rows,
            "row_count": row_count,
        }
    finally:
        conn.close()


def generate_crud_sql(table_name: str, columns: list[dict[str, Any]]) -> dict[str, str]:
    safe_table = re.sub(r"[^A-Za-z0-9_]", "", table_name)
    pk_col = next((c["name"] for c in columns if c.get("primary_key")), "id")
    non_pk = [c["name"] for c in columns if c["name"] != pk_col]
    col_list = ", ".join(non_pk) if non_pk else pk_col
    placeholders = ", ".join(f":{c}" for c in (non_pk or [pk_col]))
    set_clause = ", ".join(f"{c} = :{c}" for c in non_pk) or f"{pk_col} = :{pk_col}"

    return {
        "select_all": f"SELECT * FROM {safe_table} ORDER BY {pk_col} DESC LIMIT 50;",
        "select_one": f"SELECT * FROM {safe_table} WHERE {pk_col} = :{pk_col};",
        "insert": f"INSERT INTO {safe_table} ({col_list}) VALUES ({placeholders});",
        "update": f"UPDATE {safe_table} SET {set_clause} WHERE {pk_col} = :{pk_col};",
        "delete": f"DELETE FROM {safe_table} WHERE {pk_col} = :{pk_col};",
    }
