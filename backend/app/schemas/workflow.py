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


# ── Items ────────────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty")
        return v


class ItemMove(BaseModel):
    comment: str | None = Field(None, max_length=1000)


class ItemOut(BaseModel):
    id: int
    workflow_id: int
    current_stage_id: int | None
    title: str
    description: str | None = None
    is_completed: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}


class ItemHistoryOut(BaseModel):
    id: int
    action: str
    from_stage_name: str | None = None
    to_stage_name: str | None = None
    comment: str | None = None
    created_at: datetime | None = None
    actor: CreatorOut | None = None


class PendingStageOut(BaseModel):
    """How many open items are waiting at a stage the current user may open."""
    workflow_id: int
    workflow_name: str
    stage_id: int
    stage_name: str
    stage_type: StageType
    sequence_order: int
    count: int
