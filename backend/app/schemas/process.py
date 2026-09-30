from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.base import CreatorOut


class ProcessBase(BaseModel):
    name: str = Field(..., max_length=150)
    description: str | None = Field(None, max_length=500)
    is_active: bool = True


class ProcessCreate(ProcessBase):
    pass


class ProcessUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    description: str | None = Field(None, max_length=500)
    is_active: bool | None = None


class ProcessOut(ProcessBase):
    id: int
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
