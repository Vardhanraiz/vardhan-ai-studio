"""Comprehensive integration tests covering Files, Terminal, Agent, Builder, DB, Debugger, Tests, Git, and Deploy."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.core.config import Settings


def _create_sample_project(client: TestClient, name: str = "Demo Studio App") -> dict:
    resp = client.post(
        "/api/v1/projects",
        json={"name": name, "description": "Test project", "tech_stack": "Python FastAPI, SQLite"},
    )
    assert resp.status_code == 201
    return resp.json()


def test_file_lifecycle_backups_diff_search_and_security(client: TestClient) -> None:
    proj = _create_sample_project(client)
    pid = proj["id"]

    # Create file
    r_create = client.post(
        f"/api/v1/projects/{pid}/files/create",
        json={"path": "src/app.py", "type": "file", "content": "def greet():\n    return 'hello'\n"},
    )
    assert r_create.status_code == 201
    assert r_create.json()["language"] == "python"

    # Tree lists the created file
    tree = client.get(f"/api/v1/projects/{pid}/files/tree").json()["tree"]
    assert any(n["name"] == "src" for n in tree)

    # Read content
    read_res = client.get(f"/api/v1/projects/{pid}/files/content", params={"path": "src/app.py"})
    assert read_res.status_code == 200
    assert "greet" in read_res.json()["content"]

    # Save with automatic backup + diff
    save_res = client.put(
        f"/api/v1/projects/{pid}/files/save",
        json={"path": "src/app.py", "content": "def greet():\n    return 'vardhan'\n"},
    )
    assert save_res.status_code == 200
    backup_path = save_res.json()["backup_path"]
    assert backup_path
    assert "-    return 'hello'" in save_res.json()["unified_diff"]
    assert "+    return 'vardhan'" in save_res.json()["unified_diff"]

    # Search
    search_res = client.post(f"/api/v1/projects/{pid}/files/search", json={"query": "vardhan"})
    assert search_res.status_code == 200
    assert search_res.json()["count"] == 1

    # Restore backup
    restore_res = client.post(
        f"/api/v1/projects/{pid}/files/restore",
        json={"path": "src/app.py", "backup_path": backup_path},
    )
    assert restore_res.status_code == 200
    restored = client.get(f"/api/v1/projects/{pid}/files/content", params={"path": "src/app.py"}).json()
    assert "hello" in restored["content"]

    # Path traversal blocked with 403
    bad_read = client.get(f"/api/v1/projects/{pid}/files/content", params={"path": "../../secret.txt"})
    assert bad_read.status_code == 403

    # Delete requires confirm=true
    assert client.delete(f"/api/v1/projects/{pid}/files", params={"path": "src/app.py"}).status_code == 400
    assert (
        client.delete(
            f"/api/v1/projects/{pid}/files", params={"path": "src/app.py", "confirm": True}
        ).status_code
        == 200
    )


def test_terminal_allowlist_approval_and_blocking(client: TestClient) -> None:
    proj = _create_sample_project(client, "Terminal Demo")
    pid = proj["id"]

    # Safe command runs immediately
    safe_res = client.post(
        "/api/v1/terminal/run",
        json={"project_id": pid, "command": "echo vardhan_ok", "approved": False},
    )
    assert safe_res.status_code == 200
    assert safe_res.json()["executed"] is True
    assert "vardhan_ok" in safe_res.json()["stdout"]

    # Non-allowlisted command requires explicit approval
    needs_approval = client.post(
        "/api/v1/terminal/run",
        json={"project_id": pid, "command": "python -c \"print(40 + 2)\"", "approved": False},
    )
    assert needs_approval.status_code == 200
    assert needs_approval.json()["approval_required"] is True
    assert needs_approval.json()["executed"] is False

    # Destructive command is strictly blocked (403)
    blocked = client.post(
        "/api/v1/terminal/run",
        json={"project_id": pid, "command": "shutdown /s /t 0", "approved": True},
    )
    assert blocked.status_code == 403


def test_app_builder_database_testing_git_and_deploy_flow(
    client: TestClient, test_settings: Settings
) -> None:
    # 1. App Builder generates real files + verifies syntax & SQLite schema
    build_res = client.post(
        "/api/v1/builder/generate",
        json={
            "app_name": "Employee Portal",
            "prompt": "Create an employee management system with login, registration, employee CRUD operations, and department management.",
            "frontend_stack": "HTML/CSS/JavaScript",
            "backend_stack": "Python FastAPI",
            "database_stack": "SQLite",
        },
    )
    assert build_res.status_code == 200
    built = build_res.json()
    assert built["verified"] is True
    pid = built["project"]["id"]
    assert "employees" in built["entities"]
    assert "departments" in built["entities"]
    assert (test_settings.workspace_root / "employee-portal" / "backend" / "main.py").is_file()

    # 2. Preview endpoint serves generated HTML
    preview = client.get(f"/api/v1/projects/{pid}/preview/frontend/index.html")
    assert preview.status_code == 200
    assert "Employee Portal" in preview.text

    # 3. Database Assistant inspects real SQLite tables & relationships
    db_list = client.get(f"/api/v1/projects/{pid}/database/list").json()["databases"]
    assert any(d["path"] == "backend/app.db" for d in db_list)

    schema = client.get(
        f"/api/v1/projects/{pid}/database/schema", params={"db_path": "backend/app.db"}
    ).json()
    table_names = [t["name"] for t in schema["tables"]]
    assert "users" in table_names
    assert "employees" in table_names
    assert "departments" in table_names
    assert any(r["from_table"] == "employees" and r["to_table"] == "departments" for r in schema["relationships"])

    # Safe SELECT runs without approval; INSERT requires approval
    sel = client.post(
        f"/api/v1/projects/{pid}/database/query",
        json={"db_path": "backend/app.db", "sql": "SELECT COUNT(*) AS cnt FROM employees;", "approved": False},
    ).json()
    assert sel["executed"] is True
    assert sel["rows"] == [[0]]

    ins_blocked = client.post(
        f"/api/v1/projects/{pid}/database/query",
        json={
            "db_path": "backend/app.db",
            "sql": "INSERT INTO departments (name, manager_name) VALUES ('Engineering', 'Vardhan');",
            "approved": False,
        },
    ).json()
    assert ins_blocked["approval_required"] is True

    ins_ok = client.post(
        f"/api/v1/projects/{pid}/database/query",
        json={
            "db_path": "backend/app.db",
            "sql": "INSERT INTO departments (name, manager_name) VALUES ('Engineering', 'Vardhan');",
            "approved": True,
        },
    ).json()
    assert ins_ok["executed"] is True

    # 4. Testing Agent detects pytest framework
    fw = client.get(f"/api/v1/projects/{pid}/tests/frameworks").json()["frameworks"]
    assert any(f["framework"] == "pytest" for f in fw)

    # 5. Git workflow: init -> status -> commit (requires approval) -> log -> branch
    assert client.post(f"/api/v1/projects/{pid}/git/init").status_code == 200
    commit_req = client.post(
        f"/api/v1/projects/{pid}/git/commit",
        json={"message": "Initial generated app", "approved": False},
    ).json()
    assert commit_req["approval_required"] is True

    commit_ok = client.post(
        f"/api/v1/projects/{pid}/git/commit",
        json={"message": "Initial generated app", "approved": True},
    ).json()
    assert commit_ok["committed"] is True

    git_overview = client.get(f"/api/v1/projects/{pid}/git/overview").json()
    assert git_overview["status"]["initialized"] is True
    assert len(git_overview["commits"]) >= 1

    # 6. Deployment Assistant detects stack and generates Render + Docker config
    deploy = client.get(
        f"/api/v1/projects/{pid}/deploy/plan", params={"target": "Render"}
    ).json()
    assert "Python" in deploy["detected_stack"]
    assert deploy["config_filename"] == "render.yaml"
    assert "FROM python:3.12-slim" in deploy["dockerfile"]


def test_coding_agent_plan_approve_and_revert(client: TestClient) -> None:
    proj = _create_sample_project(client, "Agent Workspace")
    pid = proj["id"]

    mocked_llm_json = json.dumps(
        {
            "plan": ["Create hello.py with greeting helper"],
            "summary": "Adds a clean hello.py helper module.",
            "changes": [
                {
                    "file_path": "hello.py",
                    "change_type": "create",
                    "rationale": "Requested greeting helper",
                    "content": "def say_hi(name: str) -> str:\n    return f'Hi, {name}!'\n",
                }
            ],
        }
    )

    with patch(
        "app.services.ai_service.generate_complete_response",
        new=AsyncMock(return_value=mocked_llm_json),
    ):
        plan_res = client.post(
            "/api/v1/agent/plan",
            json={"project_id": pid, "instruction": "Create hello.py with a say_hi function"},
        )
    assert plan_res.status_code == 201
    task = plan_res.json()
    assert task["status"] == "awaiting_approval"
    assert len(task["changes"]) == 1
    change_id = task["changes"][0]["id"]

    # File must NOT exist before approval
    assert (
        client.get(f"/api/v1/projects/{pid}/files/content", params={"path": "hello.py"}).status_code
        == 404
    )

    # Approve change
    approved = client.post(
        f"/api/v1/agent/tasks/{task['id']}/approve",
        json={"change_ids": [change_id]},
    ).json()
    assert approved["status"] == "completed"
    assert approved["changes"][0]["status"] == "applied"

    # File exists now
    content = client.get(f"/api/v1/projects/{pid}/files/content", params={"path": "hello.py"}).json()
    assert "say_hi" in content["content"]

    # Revert applied change
    reverted = client.post(
        f"/api/v1/agent/tasks/{task['id']}/changes/{change_id}/revert"
    ).json()
    assert reverted["changes"][0]["status"] == "reverted"
    assert (
        client.get(f"/api/v1/projects/{pid}/files/content", params={"path": "hello.py"}).status_code
        == 404
    )


def test_debugger_parses_python_traceback(client: TestClient) -> None:
    trace = (
        'Traceback (most recent call last):\n'
        '  File "app/main.py", line 42, in calculate\n'
        '    return total / count\n'
        'ZeroDivisionError: division by zero'
    )
    with patch(
        "app.services.ai_service.generate_complete_response",
        new=AsyncMock(return_value="Guard against count == 0 before dividing."),
    ):
        resp = client.post("/api/v1/debugger/analyze", json={"error_text": trace})
    assert resp.status_code == 200
    body = resp.json()
    assert body["parsed"]["category"] == "python"
    assert body["parsed"]["frames"][0]["line"] == 42
    assert "ZeroDivisionError" in body["parsed"]["primary_message"]
    assert body["ai_available"] is True
