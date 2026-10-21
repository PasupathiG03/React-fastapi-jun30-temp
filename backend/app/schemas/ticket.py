from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.base import CreatorOut

TicketType = Literal["bug", "requirement"]
TicketPriority = Literal["low", "medium", "high"]
TicketStatus = Literal["open", "in_progress", "resolved"]


class TicketCreate(BaseModel):
    type: TicketType
    subject: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=10000)
    priority: TicketPriority = "medium"


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    priority: TicketPriority | None = None


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
    created_at: datetime
    updated_at: datetime
    creator: CreatorOut | None = None

    model_config = {"from_attributes": True}


class TicketDetailOut(TicketOut):
    replies: list[TicketReplyOut] = []
