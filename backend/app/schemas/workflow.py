from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.workflow import StageType
from app.schemas.base import CreatorOut


# ── Stage ────────────────────────────────────────────────────────────────

class StageCreate(BaseModel):
    name: str = Field(..., max_length=150)
    stage_type: StageType = StageType.PRODUCTION
    sequence_order: int = 0

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Stage name cannot be empty")
        return v


class StageUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    stage_type: StageType | None = None
    sequence_order: int | None = None


class StageOut(BaseModel):
    id: int
    level_id: int
    name: str
    stage_type: StageType
    sequence_order: int
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}


# ── Level ────────────────────────────────────────────────────────────────

class LevelCreate(BaseModel):
    pass


class LevelOut(BaseModel):
    id: int
    workflow_id: int
    order: int
    stages: list[StageOut] = []
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


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


class WorkflowDetailOut(WorkflowOut):
    levels: list[LevelOut] = []
