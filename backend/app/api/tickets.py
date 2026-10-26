from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.builtin_screens import SUPPORT_SCREEN
from app.core.dependencies import get_db, has_full_access, require_screen
from app.models.ticket import Ticket, TicketReply
from app.schemas.ticket import (
    TicketCreate,
    TicketDetailOut,
    TicketEdit,
    TicketOut,
    TicketReplyCreate,
    TicketReplyOut,
    TicketUpdate,
)

# Support is a built-in screen (builtin_screens.py): Developers always have access, other roles once it is
# granted in Menu Access (require_screen). On top of that:
#   * Only full access (is_superuser AND the Developer role) resolves tickets: sees every ticket, changes its
#     status and replies. Nobody else can, whatever their role is called.
#   * Everyone else with the screen can raise tickets and follow the status of their own tickets (and read
#     the replies), but cannot see other people's tickets, change a status or reply.
#   * Whoever raised a ticket can edit or delete it, but only until a Developer starts working on it (while it
#     is still "new" or "open").
router = APIRouter()

# Statuses in which the person who raised a ticket may still edit or delete it.
OWNER_EDITABLE_STATUSES = ("new", "open")


def can_manage_tickets(user) -> bool:
    return has_full_access(user)


def _can_edit(ticket: Ticket, user) -> bool:
    return ticket.created_by_id == user.id and ticket.status in OWNER_EDITABLE_STATUSES


class TicketPermissions(BaseModel):
    can_manage: bool


def _get_ticket(db: Session, ticket_id: int, user) -> Ticket:
    ticket = (
        db.query(Ticket)
        .options(joinedload(Ticket.creator), joinedload(Ticket.replies).joinedload(TicketReply.creator))
        .filter(Ticket.id == ticket_id)
        .first()
    )
    # Someone else's ticket looks the same as one that doesn't exist.
    if not ticket or (not can_manage_tickets(user) and ticket.created_by_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


def _detail(ticket: Ticket, user) -> TicketDetailOut:
    out = TicketDetailOut.model_validate(ticket)
    out.reply_count = len(ticket.replies)
    out.can_edit = _can_edit(ticket, user)
    return out


@router.get("/permissions", response_model=TicketPermissions)
def my_permissions(user=Depends(require_screen(SUPPORT_SCREEN))):
    """Whether this user resolves tickets (sees all, changes status) or only raises and follows their own."""
    return TicketPermissions(can_manage=can_manage_tickets(user))


@router.get("/", response_model=List[TicketOut])
def list_tickets(db: Session = Depends(get_db), user=Depends(require_screen(SUPPORT_SCREEN))):
    """Resolvers: every ticket. Everyone else: only their own. Most recently updated first, with reply count."""
    reply_counts = (
        db.query(TicketReply.ticket_id, func.count(TicketReply.id).label("n"))
        .group_by(TicketReply.ticket_id)
        .subquery()
    )
    query = (
        db.query(Ticket, func.coalesce(reply_counts.c.n, 0))
        .options(joinedload(Ticket.creator))
        .outerjoin(reply_counts, reply_counts.c.ticket_id == Ticket.id)
    )
    if not can_manage_tickets(user):
        query = query.filter(Ticket.created_by_id == user.id)
    rows = query.order_by(Ticket.updated_at.desc(), Ticket.id.desc()).all()
    result = []
    for ticket, n in rows:
        out = TicketOut.model_validate(ticket)
        out.reply_count = n
        out.can_edit = _can_edit(ticket, user)
        result.append(out)
    return result


def _clean(data: dict) -> dict:
    data["subject"] = data["subject"].strip()
    data["description"] = data["description"].strip()
    if not data["subject"] or not data["description"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject and description are required")
    return data


@router.post("/", response_model=TicketDetailOut, status_code=status.HTTP_201_CREATED)
def create_ticket(payload: TicketCreate, db: Session = Depends(get_db), user=Depends(require_screen(SUPPORT_SCREEN))):
    data = _clean(payload.model_dump())
    # Set the owner explicitly: "only my own tickets" depends on it, so it must not rely on the audit hook alone.
    ticket = Ticket(**data, created_by_id=user.id)
    db.add(ticket)
    db.commit()
    return _detail(_get_ticket(db, ticket.id, user), user)


@router.get("/{ticket_id}", response_model=TicketDetailOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db), user=Depends(require_screen(SUPPORT_SCREEN))):
    ticket = _get_ticket(db, ticket_id, user)
    # The first time a Developer opens a new ticket it becomes "open", so the person who raised it can see it
    # has been picked up. Only a resolver's view counts; the owner opening their own ticket changes nothing.
    if ticket.status == "new" and can_manage_tickets(user):
        ticket.status = "open"
        db.commit()
        ticket = _get_ticket(db, ticket_id, user)
    return _detail(ticket, user)


@router.put("/{ticket_id}", response_model=TicketDetailOut)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_screen(SUPPORT_SCREEN)),
):
    if not can_manage_tickets(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a Developer can change a ticket's status")
    ticket = _get_ticket(db, ticket_id, user)
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(ticket, key, value)
    db.commit()
    return _detail(_get_ticket(db, ticket_id, user), user)


def _get_editable_ticket(db: Session, ticket_id: int, user) -> Ticket:
    """The caller's own ticket, if a Developer hasn't started on it yet."""
    ticket = _get_ticket(db, ticket_id, user)
    if ticket.created_by_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only change tickets you raised")
    if ticket.status not in OWNER_EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A Developer is already working on this ticket, so it can no longer be changed",
        )
    return ticket


@router.put("/{ticket_id}/edit", response_model=TicketDetailOut)
def edit_ticket(
    ticket_id: int,
    payload: TicketEdit,
    db: Session = Depends(get_db),
    user=Depends(require_screen(SUPPORT_SCREEN)),
):
    """Change the content of a ticket you raised, until a Developer starts working on it."""
    ticket = _get_editable_ticket(db, ticket_id, user)
    for key, value in _clean(payload.model_dump()).items():
        setattr(ticket, key, value)
    db.commit()
    return _detail(_get_ticket(db, ticket_id, user), user)


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(ticket_id: int, db: Session = Depends(get_db), user=Depends(require_screen(SUPPORT_SCREEN))):
    """Delete a ticket you raised (and its replies) for good, until a Developer starts working on it."""
    ticket = _get_editable_ticket(db, ticket_id, user)
    db.delete(ticket)
    db.commit()


@router.post("/{ticket_id}/replies", response_model=TicketReplyOut, status_code=status.HTTP_201_CREATED)
def add_reply(
    ticket_id: int,
    payload: TicketReplyCreate,
    db: Session = Depends(get_db),
    user=Depends(require_screen(SUPPORT_SCREEN)),
):
    if not can_manage_tickets(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a Developer can reply to a ticket")
    ticket = _get_ticket(db, ticket_id, user)
    if ticket.status == "resolved":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This ticket is resolved. Reopen it to reply.")
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
