from pydantic import BaseModel, field_validator
import re

# Case-insensitive so users can type "mah001" or "MAH001"
_EMPLOYEE_ID_RE = re.compile(
    r'^(MAH[a-zA-Z0-9]+|MNW[a-zA-Z0-9]+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)$',
    re.IGNORECASE,
)


class LoginRequest(BaseModel):
    employee_id: str
    password: str

    @field_validator("employee_id")
    @classmethod
    def validate_employee_id(cls, v: str) -> str:
        v = v.strip()
        if not _EMPLOYEE_ID_RE.match(v):
            raise ValueError(
                "Employee ID must start with 'MAH' or 'MNW' followed by "
                "alphanumeric characters, or be a valid email address."
            )
        # Normalize MAH/MNW IDs to uppercase so login matches stored value
        if v[:3].upper() in ("MAH", "MNW"):
            v = v.upper()
        return v


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    employee_id: str


class UserOut(BaseModel):
    id: int
    employee_id: str
    employee_name: str | None
    location: str | None
    is_active: bool
    is_superuser: bool

    model_config = {"from_attributes": True}

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long")
        if not re.search(r"[a-zA-Z]", v):
            raise ValueError("Password must contain at least one alphabet character")
        if not re.search(r"[^a-zA-Z0-9\s]", v):
            raise ValueError("Password must contain at least one symbol")
        return v
