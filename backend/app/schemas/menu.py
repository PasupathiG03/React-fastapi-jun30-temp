from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from app.schemas.base import CreatorOut
from app.schemas.process import ProcessOut


class MenuCreate(BaseModel):
    name: str
    icon: str | None = None
    url: str
    order: int = Field(1, ge=1)
    process_id: int

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Screen name cannot be empty")
        if len(v) > 150:
            raise ValueError("Screen name must be 150 characters or less")
        return v

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("/"):
            v = "/" + v
        return v


class MenuUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    url: str | None = None
    order: int | None = Field(None, ge=1)
    process_id: int | None = None
    is_active: bool | None = None
    is_deleted: bool | None = None


class MenuReorderItem(BaseModel):
    id: int
    order: int



class MenuOut(BaseModel):
    id: int
    name: str
    icon: str | None = None
    url: str
    order: int
    process_id: int | None = None
    process: ProcessOut | None = None
    is_active: bool
    is_deleted: bool
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
