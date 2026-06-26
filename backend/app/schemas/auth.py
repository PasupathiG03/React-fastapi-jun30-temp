from pydantic import BaseModel, field_validator
import re

_EMPLOYEE_ID_RE = re.compile(
    r'^(MAH[a-zA-Z0-9]+|MNW[a-zA-Z0-9]+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)$'
)


class LoginRequest(BaseModel):
    employee_id: str
    password: str

    @field_validator("employee_id")
    @classmethod
    def validate_employee_id(cls, v: str) -> str:
        if not _EMPLOYEE_ID_RE.match(v):
            raise ValueError(
                "Employee ID must start with 'MAH' or 'MNW' followed by "
                "alphanumeric characters, or be a valid email address."
            )
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
