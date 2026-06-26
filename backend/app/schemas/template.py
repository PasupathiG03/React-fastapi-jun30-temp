from pydantic import BaseModel
from datetime import datetime
from app.schemas.base import CreatorOut

class TemplateBase(BaseModel):
    filename: str
    path: str
    size: int

class TemplateCreate(TemplateBase):
    pass

class TemplateOut(TemplateBase):
    id: int
    created_at: datetime
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
