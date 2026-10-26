from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_screen
from app.core.builtin_screens import DEVELOPER_ONLY_SCREENS, MENU_ACCESS_SCREEN
from app.models.access import RoleMenuAccess
from app.models.menu import Menu
from app.models.role import Role
from app.models.workflow import Workflow, WorkflowStage

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


class BulkAccessUpdate(BaseModel):
    updates: List[AccessUpdate]


def _dedupe(updates: List[AccessUpdate]) -> List[AccessUpdate]:
    """If the same (role, target) appears twice, the last one wins."""
    return list({(u.role_id, u.menu_id): u for u in updates}.values())


@router.get("/", response_model=AccessMatrix)
def get_access_matrix(
    process_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(require_screen(MENU_ACCESS_SCREEN)),
):
    from sqlalchemy import case
    roles = (
        db.query(Role)
        .filter(Role.is_active == True)
        .order_by(
            case((Role.name.ilike("developer"), 0), else_=1),
            Role.name
        )
        .all()
    )

    # Developer-only screens are always open to Developers and can never be granted to another role.
    query = db.query(Menu).filter(Menu.is_deleted == False, Menu.url.notin_(DEVELOPER_ONLY_SCREENS))
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
    _=Depends(require_screen(MENU_ACCESS_SCREEN)),
):
    """Allow or revoke one role's access to one screen."""
    if not db.query(Role.id).filter(Role.id == payload.role_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    menu = db.query(Menu).filter(Menu.id == payload.menu_id).first()
    if not menu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screen not found")
    if payload.allowed and menu.url in DEVELOPER_ONLY_SCREENS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This screen is only available to Developers")

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


@router.put("/bulk", status_code=status.HTTP_204_NO_CONTENT)
def set_access_bulk(
    payload: BulkAccessUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_screen(MENU_ACCESS_SCREEN)),
):
    """Apply many role x screen changes atomically: every change is validated first, then all are saved in one
    transaction. If anything is invalid or fails, nothing is changed."""
    updates = _dedupe(payload.updates)
    if not updates:
        return

    role_ids = {u.role_id for u in updates}
    menu_ids = {u.menu_id for u in updates}
    found_roles = {r_id for (r_id,) in db.query(Role.id).filter(Role.id.in_(role_ids)).all()}
    menus = {m.id: m for m in db.query(Menu).filter(Menu.id.in_(menu_ids)).all()}

    if role_ids - found_roles:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if menu_ids - menus.keys():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screen not found")
    if any(u.allowed and menus[u.menu_id].url in DEVELOPER_ONLY_SCREENS for u in updates):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This screen is only available to Developers")

    try:
        existing = {
            (g.role_id, g.menu_id): g
            for g in db.query(RoleMenuAccess)
            .filter(RoleMenuAccess.role_id.in_(role_ids), RoleMenuAccess.menu_id.in_(menu_ids))
            .all()
        }
        for u in updates:
            row = existing.get((u.role_id, u.menu_id))
            if u.allowed and not row:
                db.add(RoleMenuAccess(role_id=u.role_id, menu_id=u.menu_id))
            elif not u.allowed and row:
                db.delete(row)
        db.commit()
    except Exception:
        db.rollback()
        raise


# ── Workflow stages: same roles x rows matrix, rows are the stages of one workflow ──

@router.get("/workflow-stages", response_model=AccessMatrix)
def get_stage_access_matrix(
    workflow_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_screen(MENU_ACCESS_SCREEN)),
):
    """Roles x stages matrix for one workflow. In the response, `screens` are the stages and
    `menu_id` in a grant is the stage id, so the Menu Access page can reuse the same table."""
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    roles = db.query(Role).filter(Role.is_active == True).order_by(Role.name).all()
    stages = workflow.stages
    return AccessMatrix(
        roles=[AccessRole(id=r.id, name=r.name) for r in roles],
        screens=[AccessScreen(id=s.id, name=s.name, url="") for s in stages],
        grants=[
            AccessGrant(role_id=role_id, menu_id=stage.id)
            for stage in stages
            for role_id in (stage.role_ids or [])
        ],
    )


@router.put("/workflow-stages", status_code=status.HTTP_204_NO_CONTENT)
def set_stage_access(
    payload: AccessUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_screen(MENU_ACCESS_SCREEN)),
):
    """Allow or revoke one role's access to one workflow stage (`menu_id` is the stage id)."""
    role = db.query(Role).filter(Role.id == payload.role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    stage = db.query(WorkflowStage).filter(WorkflowStage.id == payload.menu_id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    has = role.id in (stage.role_ids or [])
    if payload.allowed and not has:
        stage.role_ids = [*(stage.role_ids or []), role.id]
    elif not payload.allowed and has:
        stage.role_ids = [rid for rid in stage.role_ids if rid != role.id]
    db.commit()


@router.put("/workflow-stages/bulk", status_code=status.HTTP_204_NO_CONTENT)
def set_stage_access_bulk(
    payload: BulkAccessUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_screen(MENU_ACCESS_SCREEN)),
):
    """Apply many role x stage changes atomically (`menu_id` is the stage id): validate everything first, then
    save all in one transaction, or change nothing."""
    updates = _dedupe(payload.updates)
    if not updates:
        return

    role_ids = {u.role_id for u in updates}
    stage_ids = {u.menu_id for u in updates}
    found_roles = {r_id for (r_id,) in db.query(Role.id).filter(Role.id.in_(role_ids)).all()}
    stages = {s.id: s for s in db.query(WorkflowStage).filter(WorkflowStage.id.in_(stage_ids)).all()}

    if role_ids - found_roles:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if stage_ids - stages.keys():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    try:
        for stage_id, stage in stages.items():
            current = list(stage.role_ids or [])
            for u in (x for x in updates if x.menu_id == stage_id):
                if u.allowed and u.role_id not in current:
                    current.append(u.role_id)
                elif not u.allowed and u.role_id in current:
                    current.remove(u.role_id)
            if current != list(stage.role_ids or []):
                stage.role_ids = current
        db.commit()
    except Exception:
        db.rollback()
        raise
