"""End-to-end API tests for project lifecycle and audit log recording."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import Settings


def test_project_crud_and_audit_trail(client: TestClient, test_settings: Settings) -> None:
    # 1. Initially empty
    resp = client.get("/api/v1/projects")
    assert resp.status_code == 200
    assert resp.json() == []

    # 2. Create project
    create_resp = client.post(
        "/api/v1/projects",
        json={
            "name": "Employee Manager",
            "description": "Internal HR CRUD portal",
            "tech_stack": "React, FastAPI, SQLite",
        },
    )
    assert create_resp.status_code == 201
    project = create_resp.json()
    assert project["slug"] == "employee-manager"
    assert project["relative_path"] == "employee-manager"
    assert (test_settings.workspace_root / "employee-manager").is_dir()

    # 3. Duplicate slug rejected with 409
    dup_resp = client.post(
        "/api/v1/projects",
        json={"name": "Employee Manager", "slug": "employee-manager"},
    )
    assert dup_resp.status_code == 409

    # 4. Get by ID
    get_resp = client.get(f"/api/v1/projects/{project['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Employee Manager"

    # 5. Update project
    patch_resp = client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"description": "Updated HR portal", "mark_opened": True},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["description"] == "Updated HR portal"

    # 6. Delete metadata (non-destructive on disk)
    del_resp = client.delete(f"/api/v1/projects/{project['id']}")
    assert del_resp.status_code == 204
    assert (test_settings.workspace_root / "employee-manager").is_dir()
    assert client.get(f"/api/v1/projects/{project['id']}").status_code == 404

    # 7. Audit logs captured create, update, and unregister
    audit_resp = client.get("/api/v1/audit-logs")
    assert audit_resp.status_code == 200
    actions = [row["action"] for row in audit_resp.json()]
    assert "project.create" in actions
    assert "project.update" in actions
    assert "project.unregister" in actions


def test_project_create_blocks_path_traversal_slug(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/projects",
        json={"name": "Bad Project", "slug": "../escape"},
    )
    assert resp.status_code == 403
