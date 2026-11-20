"""FastAPI application factory for Vardhan AI Studio."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes_agent import router as agent_router
from app.api.routes_chat import router as chat_router
from app.api.routes_files import router as files_router
from app.api.routes_models import router as models_router
from app.api.routes_modules import router as modules_router
from app.api.routes_projects import router as projects_router
from app.api.routes_system import router as system_router
from app.api.routes_terminal import router as terminal_router
from app.api.routes_ws import router as ws_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.database.session import DatabaseManager
from app.security.sandbox import WorkspaceSecurityError


def create_app(settings_override: Optional[Settings] = None) -> FastAPI:
    """Build and configure a FastAPI instance with isolated state."""
    settings = settings_override or get_settings()
    settings.ensure_directories()
    configure_logging(debug=settings.app_debug)

    db_manager = DatabaseManager(settings.database_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        db_manager.init_tables()
        yield
        db_manager.dispose()

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Unified Local-First AI Software Development Platform API",
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.db_manager = db_manager

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(WorkspaceSecurityError)
    async def _handle_workspace_security_error(
        _request: Request, exc: WorkspaceSecurityError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc)},
        )

    @app.get("/", tags=["root"])
    def root() -> dict[str, str]:
        return {
            "app": settings.app_name,
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/api/v1/health",
        }

    app.include_router(system_router)
    app.include_router(projects_router)
    app.include_router(models_router)
    app.include_router(chat_router)
    app.include_router(files_router)
    app.include_router(agent_router)
    app.include_router(terminal_router)
    app.include_router(modules_router)
    app.include_router(ws_router)

    return app


app = create_app()
