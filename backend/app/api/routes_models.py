"""Model management endpoints: Ollama detection, local models, pulling, and parameters."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_db
from app.core.config import Settings
from app.security.audit import record_audit_event
from app.security.auth import verify_api_key
from app.services import ai_service

router = APIRouter(
    prefix="/api/v1/models",
    tags=["models"],
    dependencies=[Depends(verify_api_key)],
)


class ModelConfigUpdate(BaseModel):
    ai_provider: Optional[str] = Field(default=None, pattern="^(ollama|openai_compat)$")
    default_model: Optional[str] = Field(default=None, min_length=1, max_length=120)
    ollama_base_url: Optional[str] = Field(default=None, min_length=7, max_length=255)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    num_ctx: Optional[int] = Field(default=None, ge=512, le=32768)
    openai_compat_base_url: Optional[str] = None
    openai_compat_model: Optional[str] = None
    openai_compat_api_key: Optional[str] = None


class ModelPullRequest(BaseModel):
    model_name: str = Field(..., min_length=2, max_length=120)
    approved: bool = Field(default=False)


@router.get("/status")
async def get_models_status(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    config = ai_service.get_model_config(db, settings)
    ollama = await ai_service.get_ollama_status(config["ollama_base_url"])
    return {"config": config, "ollama": ollama}


@router.put("/config")
def update_model_config(
    payload: ModelConfigUpdate,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    ai_service.save_model_config(db, payload.model_dump(exclude_none=True))
    record_audit_event(
        db,
        action="models.config_update",
        details={k: v for k, v in payload.model_dump(exclude_none=True).items() if k != "openai_compat_api_key"},
    )
    return {"config": ai_service.get_model_config(db, settings)}


@router.post("/pull")
async def pull_model(
    payload: ModelPullRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    if not payload.approved:
        return {
            "pulled": False,
            "approval_required": True,
            "message": f"Explicit approval is required to download Ollama model '{payload.model_name}'.",
        }
    config = ai_service.get_model_config(db, settings)
    try:
        result = await ai_service.pull_ollama_model(config["ollama_base_url"], payload.model_name)
    except ai_service.AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    record_audit_event(
        db,
        action="models.pull",
        details={"model": payload.model_name, "status": result["status"]},
    )
    return {"pulled": True, **result}
