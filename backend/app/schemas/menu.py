from pydantic import BaseModel, field_validator
from datetime import datetime
from app.schemas.base import CreatorOut
from app.schemas.process import ProcessOut


class MenuCreate(BaseModel):
    name: str
    icon: str | None = None
    url: str
    group: str | None = None
    order: int = 0
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

    @field_validator("group")
    @classmethod
    def validate_group(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip() or None
        return v


class MenuUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    url: str | None = None
    group: str | None = None
    order: int | None = None
    process_id: int | None = None
    is_active: bool | None = None
    status: bool | None = None


class MenuReorderItem(BaseModel):
    id: int
    order: int



class MenuOut(BaseModel):
    id: int
    name: str
    icon: str | None = None
    url: str
    group: str | None = None
    order: int
    process_id: int | None = None
    process: ProcessOut | None = None
    is_active: bool
    status: bool
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
