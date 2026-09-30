from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_superuser
from app.models.access import RoleMenuAccess
from app.models.menu import Menu
from app.models.role import Role

router = APIRouter()


class AccessRole(BaseModel):
    id: int
    name: str


class AccessScreen(BaseModel):
    id: int
    name: str
    url: str


class AccessGrant(BaseModel):
    role_id: int
    menu_id: int


class AccessMatrix(BaseModel):
    roles: List[AccessRole]
    screens: List[AccessScreen]
    grants: List[AccessGrant]


class AccessUpdate(BaseModel):
    role_id: int
    menu_id: int
    allowed: bool


@router.get("/", response_model=AccessMatrix)
def get_access_matrix(
    process_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Roles x screens matrix for one process (all screens when no process is given)."""
    roles = db.query(Role).filter(Role.is_active == True).order_by(Role.name).all()

    query = db.query(Menu).filter(Menu.status == False)
    if process_id is not None:
        query = query.filter(Menu.process_id == process_id)
    screens = query.order_by(Menu.order, Menu.id).all()

    screen_ids = [s.id for s in screens]
    grants = (
        db.query(RoleMenuAccess).filter(RoleMenuAccess.menu_id.in_(screen_ids)).all() if screen_ids else []
    )
    return AccessMatrix(
        roles=[AccessRole(id=r.id, name=r.name) for r in roles],
        screens=[AccessScreen(id=s.id, name=s.name, url=s.url) for s in screens],
        grants=[AccessGrant(role_id=g.role_id, menu_id=g.menu_id) for g in grants],
    )


@router.put("/", status_code=status.HTTP_204_NO_CONTENT)
def set_access(
    payload: AccessUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Allow or revoke one role's access to one screen."""
    if not db.query(Role.id).filter(Role.id == payload.role_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if not db.query(Menu.id).filter(Menu.id == payload.menu_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screen not found")

    existing = (
        db.query(RoleMenuAccess)
        .filter(RoleMenuAccess.role_id == payload.role_id, RoleMenuAccess.menu_id == payload.menu_id)
        .first()
    )
    if payload.allowed and not existing:
        db.add(RoleMenuAccess(role_id=payload.role_id, menu_id=payload.menu_id))
    elif not payload.allowed and existing:
        db.delete(existing)
    db.commit()
