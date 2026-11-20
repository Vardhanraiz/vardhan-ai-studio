"""Application configuration loaded from environment variables and `.env`."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Typed runtime settings optimized for local-first execution on 8 GB RAM."""

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = Field(default="Vardhan AI Studio")
    app_version: str = Field(default="0.2.0")
    app_env: str = Field(default="development")
    app_debug: bool = Field(default=True)

    backend_host: str = Field(default="127.0.0.1")
    backend_port: int = Field(default=8000, ge=1, le=65535)
    cors_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")

    workspace_root: Path = Field(default=PROJECT_ROOT / "workspace")
    backup_dir: Path = Field(default=PROJECT_ROOT / ".vardhan_backups")
    max_file_size_kb: int = Field(default=1024, ge=16, le=10240)

    database_url: str = Field(default=f"sqlite:///{(PROJECT_ROOT / 'vardhan_studio.db').as_posix()}")

    # Local-first AI defaults (Ollama)
    ai_provider: str = Field(default="ollama")
    ollama_base_url: str = Field(default="http://127.0.0.1:11434")
    ollama_default_model: str = Field(default="qwen2.5-coder:1.5b")
    ollama_request_timeout_sec: int = Field(default=120, ge=5, le=600)

    # Security
    api_auth_enabled: bool = Field(default=False)
    api_secret_key: str = Field(default="change-me-before-enabling-network-access")

    # Optional external/cloud provider (disabled by default; may incur external cost)
    openai_compat_base_url: str = Field(default="")
    openai_compat_api_key: str = Field(default="")
    openai_compat_model: str = Field(default="")

    @field_validator("workspace_root", "backup_dir", mode="before")
    @classmethod
    def _resolve_relative_path(cls, value: str | Path) -> Path:
        path = Path(value)
        if not path.is_absolute():
            path = (PROJECT_ROOT / path).resolve()
        else:
            path = path.resolve()
        return path

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_sqlite_relative_url(cls, value: str) -> str:
        if isinstance(value, str) and value.startswith("sqlite:///./"):
            rel = value.removeprefix("sqlite:///./")
            return f"sqlite:///{(PROJECT_ROOT / rel).resolve().as_posix()}"
        return value

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def external_cloud_configured(self) -> bool:
        return bool(self.openai_compat_base_url.strip() and self.openai_compat_api_key.strip())

    def ensure_directories(self) -> None:
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
