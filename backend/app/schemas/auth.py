from pydantic import BaseModel, Field, field_validator
import re

# Case-insensitive so users can type "mah001" or "MAH001"
_EMPLOYEE_ID_RE = re.compile(
    r'^(MAH[a-zA-Z0-9]+|MNW[a-zA-Z0-9]+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)$',
    re.IGNORECASE,
)


class LoginRequest(BaseModel):
    employee_id: str = Field(..., max_length=150)
    password: str = Field(..., max_length=256)

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


class LoginResponse(BaseModel):
    """The session itself travels in an HttpOnly cookie, never in the response body."""
    message: str = "Signed in"
    idle_minutes: int  # signed out after this long without activity
    expires_in_minutes: int  # longest a single sign-in can last


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

MIN_PASSWORD_LENGTH = 10


def check_password_strength(v: str) -> str:
    """Shared by every place a password is chosen."""
    if len(v) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if len(v.encode()) > 72:
        raise ValueError("Password must be at most 72 bytes long")
    if not re.search(r"[a-zA-Z]", v):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one number")
    if not re.search(r"[^a-zA-Z0-9\s]", v):
        raise ValueError("Password must contain at least one symbol")
    return v


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., max_length=256)
    new_password: str = Field(..., max_length=256)
    confirm_password: str = Field(..., max_length=256)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return check_password_strength(v)
