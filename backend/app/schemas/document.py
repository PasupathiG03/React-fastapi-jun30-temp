from pydantic import BaseModel
from datetime import datetime
from app.schemas.base import CreatorOut


class DocumentBase(BaseModel):
    filename: str
    path: str
    size: int


class DocumentOut(DocumentBase):
    id: int
    created_at: datetime
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
