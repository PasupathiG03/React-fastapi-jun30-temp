from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_db, get_superuser
from app.models.ticket import Ticket, TicketReply
from app.schemas.ticket import TicketCreate, TicketDetailOut, TicketOut, TicketReplyCreate, TicketReplyOut, TicketUpdate

# Support is a Developer-only screen (hard-coded in the sidebar, not in builtin_screens.py), so every
# ticket endpoint is gated the same way: get_superuser.
router = APIRouter()


def _get_ticket(db: Session, ticket_id: int) -> Ticket:
    ticket = (
        db.query(Ticket)
        .options(joinedload(Ticket.creator), joinedload(Ticket.replies).joinedload(TicketReply.creator))
        .filter(Ticket.id == ticket_id)
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


def _detail(ticket: Ticket) -> TicketDetailOut:
    out = TicketDetailOut.model_validate(ticket)
    out.reply_count = len(ticket.replies)
    return out


@router.get("/", response_model=List[TicketOut])
def list_tickets(db: Session = Depends(get_db), _=Depends(get_superuser)):
    """Every ticket, most recently updated first, with its reply count."""
    reply_counts = (
        db.query(TicketReply.ticket_id, func.count(TicketReply.id).label("n"))
        .group_by(TicketReply.ticket_id)
        .subquery()
    )
    rows = (
        db.query(Ticket, func.coalesce(reply_counts.c.n, 0))
        .options(joinedload(Ticket.creator))
        .outerjoin(reply_counts, reply_counts.c.ticket_id == Ticket.id)
        .order_by(Ticket.updated_at.desc(), Ticket.id.desc())
        .all()
    )
    result = []
    for ticket, n in rows:
        out = TicketOut.model_validate(ticket)
        out.reply_count = n
        result.append(out)
    return result


@router.post("/", response_model=TicketDetailOut, status_code=status.HTTP_201_CREATED)
def create_ticket(payload: TicketCreate, db: Session = Depends(get_db), _=Depends(get_superuser)):
    data = payload.model_dump()
    data["subject"] = data["subject"].strip()
    data["description"] = data["description"].strip()
    if not data["subject"] or not data["description"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject and description are required")
    ticket = Ticket(**data)
    db.add(ticket)
    db.commit()
    return _detail(_get_ticket(db, ticket.id))


@router.get("/{ticket_id}", response_model=TicketDetailOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db), _=Depends(get_superuser)):
    return _detail(_get_ticket(db, ticket_id))


@router.put("/{ticket_id}", response_model=TicketDetailOut)
def update_ticket(ticket_id: int, payload: TicketUpdate, db: Session = Depends(get_db), _=Depends(get_superuser)):
    ticket = _get_ticket(db, ticket_id)
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(ticket, key, value)
    db.commit()
    return _detail(_get_ticket(db, ticket_id))


@router.post("/{ticket_id}/replies", response_model=TicketReplyOut, status_code=status.HTTP_201_CREATED)
def add_reply(ticket_id: int, payload: TicketReplyCreate, db: Session = Depends(get_db), _=Depends(get_superuser)):
    ticket = _get_ticket(db, ticket_id)
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reply cannot be empty")
    reply = TicketReply(ticket_id=ticket.id, message=message)
    db.add(reply)
    # A reply counts as activity on the ticket, so it moves to the top of the "Updated" list.
    ticket.updated_at = func.now()
    db.commit()
    db.refresh(reply)
    return reply
