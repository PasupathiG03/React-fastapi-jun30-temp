from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from app.schemas.base import CreatorOut

import re

_CODE_RE = re.compile(r'^[a-zA-Z0-9-]+$')


class ProcessBase(BaseModel):
    name: str = Field(..., max_length=150)
    code: str = Field(..., max_length=50)
    description: str | None = Field(None, max_length=500)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        if not _CODE_RE.match(v):
            raise ValueError("Code may only contain letters, numbers, and hyphens.")
        return v


class ProcessCreate(ProcessBase):
    pass


class ProcessUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    code: str | None = Field(None, max_length=50)
    description: str | None = Field(None, max_length=500)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not _CODE_RE.match(v):
            raise ValueError("Code may only contain letters, numbers, and hyphens.")
        return v


class ProcessOut(ProcessBase):
    id: int
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
