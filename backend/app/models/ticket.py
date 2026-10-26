from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.user import AuditMixin

TICKET_TYPES = ("bug", "requirement")
TICKET_PRIORITIES = ("low", "medium", "high")
# "new" = raised, no Developer has opened it yet; it becomes "open" the first time one does.
TICKET_STATUSES = ("new", "open", "in_progress", "resolved")


class Ticket(AuditMixin, Base):
    """A support request raised from the Support screen: a bug in the tool or a new requirement."""

    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(20), nullable=False)
    subject = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False, default="medium", server_default="medium")
    status = Column(String(20), nullable=False, default="new", server_default="new", index=True)

    replies = relationship(
        "TicketReply",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketReply.created_at",
    )

    def __repr__(self) -> str:
        return f"<Ticket id={self.id} type={self.type!r} status={self.status!r}>"


class TicketReply(AuditMixin, Base):
    __tablename__ = "ticket_replies"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(Text, nullable=False)

    ticket = relationship("Ticket", back_populates="replies")

    def __repr__(self) -> str:
        return f"<TicketReply id={self.id} ticket={self.ticket_id}>"
