from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.base import CreatorOut


class ProcessBase(BaseModel):
    name: str = Field(..., max_length=150)
    description: str | None = Field(None, max_length=500)
    is_active: bool = True


class ProcessCreate(ProcessBase):
    # Position in the sidebar; when omitted the process goes after the existing ones.
    order: int | None = Field(None, ge=1)


class ProcessUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    description: str | None = Field(None, max_length=500)
    is_active: bool | None = None
    order: int | None = Field(None, ge=1)


class ProcessOut(ProcessBase):
    id: int
    order: int
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
