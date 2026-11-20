"""Project management request and response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    slug: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=63,
        description="Optional folder slug inside workspace/; auto-derived from name if omitted.",
    )
    description: str = Field(default="", max_length=2000)
    tech_stack: str = Field(default="", max_length=255)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    tech_stack: Optional[str] = Field(default=None, max_length=255)
    mark_opened: bool = Field(default=False)


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str
    relative_path: str
    tech_stack: str
    created_at: datetime
    updated_at: datetime
    last_opened_at: Optional[datetime]
