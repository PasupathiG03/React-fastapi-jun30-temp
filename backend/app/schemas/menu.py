from pydantic import BaseModel, field_validator
from datetime import datetime
from app.schemas.base import CreatorOut


class MenuCreate(BaseModel):
    name: str
    icon: str
    url: str
    order: int = 0

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Menu name cannot be empty")
        if len(v) > 150:
            raise ValueError("Menu name must be 150 characters or less")
        return v

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("/"):
            v = "/" + v
        return v

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Icon is required")
        return v


class MenuUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    url: str | None = None
    order: int | None = None
    is_active: bool | None = None
    status: bool | None = None


class MenuReorderItem(BaseModel):
    id: int
    order: int



class MenuOut(BaseModel):
    id: int
    name: str
    icon: str
    url: str
    order: int
    is_active: bool
    status: bool
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
