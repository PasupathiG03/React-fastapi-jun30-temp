from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.base import CreatorOut


# ── Workflow ─────────────────────────────────────────────────────────────

class WorkflowCreate(BaseModel):
    name: str = Field(..., max_length=150)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Workflow name cannot be empty")
        return v


class WorkflowUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Workflow name cannot be empty")
        return v


class WorkflowOut(BaseModel):
    id: int
    name: str
    is_active: bool
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
