import re

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship, validates

from app.core.database import Base

# ---------------------------------------------------------------------------
# Regex validators (mirrored from the Django validator spec)
# ---------------------------------------------------------------------------

_ALPHANUM_RE = re.compile(r'^[a-zA-Z0-9_.@\s–—-]+$')   # – — included via unicode
_EMPLOYEE_ID_RE = re.compile(
    r'^(MAH[a-zA-Z0-9]+|MNW[a-zA-Z0-9]+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)$'
)


# ---------------------------------------------------------------------------
# AuditMixin  (equivalent to AuditModel / AuditBase)
# ---------------------------------------------------------------------------

class AuditMixin:
    """
    Adds created_at / updated_at timestamps and created_by / updated_by FK
    columns to every concrete model.  The FK values are auto-filled by the
    SQLAlchemy session event in core/database.py using the request-scoped
    context var.
    """

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Self-referential FKs use use_alter to avoid circular DDL issues.
    created_by_id = Column(
        Integer,
        ForeignKey("users.id", use_alter=True, name="fk_audit_created_by", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by_id = Column(
        Integer,
        ForeignKey("users.id", use_alter=True, name="fk_audit_updated_by", ondelete="SET NULL"),
        nullable=True,
    )


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(AuditMixin, Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    employee_name = Column(String(150), nullable=True)
    employee_id = Column(String(150), unique=True, index=True, nullable=False)
    location = Column(String(150), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean(), default=True, nullable=False)
    is_superuser = Column(Boolean(), default=False, nullable=False)

    # Self-referential relationships — use string form so SQLAlchemy
    # resolves against the mapped User columns, not the mixin originals.
    created_by = relationship(
        "User",
        foreign_keys="[User.created_by_id]",
        primaryjoin="User.created_by_id == User.id",
        uselist=False,
    )
    updated_by = relationship(
        "User",
        foreign_keys="[User.updated_by_id]",
        primaryjoin="User.updated_by_id == User.id",
        uselist=False,
    )

    # ------------------------------------------------------------------
    # SQLAlchemy column-level validators
    # ------------------------------------------------------------------

    @validates("employee_id")
    def validate_employee_id(self, key, value):
        if not _EMPLOYEE_ID_RE.match(value):
            raise ValueError(
                "Employee ID must start with 'MAH' or 'MNW' followed by "
                "alphanumeric characters, or be a valid email address."
            )
        return value

    @validates("employee_name", "location")
    def validate_alphanum_fields(self, key, value):
        if value is not None and not _ALPHANUM_RE.match(value):
            raise ValueError(
                f"{key}: only alphanumeric characters, spaces, @ _ . - – — are allowed."
            )
        return value

    def __repr__(self) -> str:
        return f"<User id={self.id} employee_id={self.employee_id!r}>"
