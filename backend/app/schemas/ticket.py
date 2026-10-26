from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.base import CreatorOut

TicketType = Literal["bug", "requirement"]
TicketPriority = Literal["low", "medium", "high"]
TicketStatus = Literal["new", "open", "in_progress", "resolved"]


class TicketCreate(BaseModel):
    type: TicketType
    subject: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=10000)
    priority: TicketPriority = "medium"


class TicketEdit(TicketCreate):
    """The owner changing their own ticket's content (same fields as raising it)."""


class TicketUpdate(BaseModel):
    # Only the status can be changed after a ticket is raised; the priority is set by whoever raised it.
    status: TicketStatus | None = None


class TicketReplyCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)


class TicketReplyOut(BaseModel):
    id: int
    message: str
    created_at: datetime
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}


class TicketOut(BaseModel):
    id: int
    type: TicketType
    subject: str
    description: str
    priority: TicketPriority
    status: TicketStatus
    reply_count: int = 0
    # True for the person who raised it while a Developer hasn't started on it (set per request, not stored).
    can_edit: bool = False
    created_at: datetime
    updated_at: datetime
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}


class TicketDetailOut(TicketOut):
    replies: list[TicketReplyOut] = []
