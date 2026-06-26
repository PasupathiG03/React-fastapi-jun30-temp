from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.base import CreatorOut

class RoleBase(BaseModel):
    name: str = Field(..., max_length=100)
    is_active: bool = True

class RoleCreate(RoleBase):
    pass

class RoleUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    is_active: bool | None = None

class RoleOut(RoleBase):
    id: int
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
