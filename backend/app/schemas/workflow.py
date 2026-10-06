from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.workflow import StageType
from app.schemas.base import CreatorOut


# ── Stage ────────────────────────────────────────────────────────────────

class StageCreate(BaseModel):
    name: str = Field(..., max_length=150)
    stage_type: StageType = StageType.PRODUCTION
    sequence_order: int = 0
    role_ids: list[int] = []

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
    role_ids: list[int] | None = None


class StageOut(BaseModel):
    id: int
    workflow_id: int
    name: str
    stage_type: StageType
    sequence_order: int
    role_ids: list[int] = []
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}


class MyStageOut(BaseModel):
    id: int
    name: str
    stage_type: StageType
    sequence_order: int

    model_config = {"from_attributes": True}


class MyWorkflowOut(BaseModel):
    id: int
    name: str
    stages: list[MyStageOut] = []


class StageAccessOut(BaseModel):
    """One stage a user is allowed to open, with just enough context for its page."""
    id: int
    name: str
    stage_type: StageType
    sequence_order: int
    total_stages: int
    is_first: bool = False
    is_last: bool = False
    workflow_id: int
    workflow_name: str
    role_names: list[str] = []


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


class CopyAccess(BaseModel):
    source_workflow_id: int


class WorkflowOut(BaseModel):
    id: int
    name: str
    is_active: bool
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}


class WorkflowDetailOut(WorkflowOut):
    stages: list[StageOut] = []

