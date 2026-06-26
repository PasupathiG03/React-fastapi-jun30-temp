import re
from pydantic import BaseModel, field_validator
from app.schemas.role import RoleOut

_ALPHANUM_RE = re.compile(r'^[a-zA-Z0-9_.@\s–—-]+$')
_EMPLOYEE_ID_RE = re.compile(
    r'^(MAH[a-zA-Z0-9]+|MNW[a-zA-Z0-9]+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)$',
    re.IGNORECASE,
)
from datetime import datetime
from app.schemas.base import CreatorOut

class UserBase(BaseModel):
    employee_id: str
    employee_name: str | None = None
    location: str | None = None
    is_active: bool = True
    is_superuser: bool = False
    role_id: int | None = None

    @field_validator("employee_id")
    @classmethod
    def validate_employee_id(cls, v: str) -> str:
        v = v.strip()
        if not _EMPLOYEE_ID_RE.match(v):
            raise ValueError(
                "Employee ID must start with 'MAH' or 'MNW' followed by "
                "alphanumeric characters, or be a valid email address."
            )
        if v[:3].upper() in ("MAH", "MNW"):
            v = v.upper()
        return v

    @field_validator("employee_name", "location")
    @classmethod
    def validate_alphanum_fields(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not _ALPHANUM_RE.match(v):
                raise ValueError("Only alphanumeric characters, spaces, @ _ . - – — are allowed.")
        return v

class UserCreate(UserBase):
    pass

class UserUpdate(BaseModel):
    employee_id: str | None = None
    employee_name: str | None = None
    location: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None
    role_id: int | None = None

    @field_validator("employee_id")
    @classmethod
    def validate_employee_id(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not _EMPLOYEE_ID_RE.match(v):
            raise ValueError(
                "Employee ID must start with 'MAH' or 'MNW' followed by "
                "alphanumeric characters, or be a valid email address."
            )
        if v[:3].upper() in ("MAH", "MNW"):
            v = v.upper()
        return v

    @field_validator("employee_name", "location")
    @classmethod
    def validate_alphanum_fields(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not _ALPHANUM_RE.match(v):
                raise ValueError("Only alphanumeric characters, spaces, @ _ . - – — are allowed.")
        return v

class UserOut(UserBase):
    id: int
    role: RoleOut | None = None
    created_at: datetime | None = None
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}
