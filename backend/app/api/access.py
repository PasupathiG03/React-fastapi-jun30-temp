from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_superuser
from app.models.access import RoleMenuAccess
from app.models.menu import Menu
from app.models.role import Role
from app.models.workflow import Workflow, WorkflowStage, workflow_stage_roles

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


# ── Workflow stages: same roles x rows matrix, rows are the stages of one workflow ──

@router.get("/workflow-stages", response_model=AccessMatrix)
def get_stage_access_matrix(
    workflow_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Roles x stages matrix for one workflow. In the response, `screens` are the stages and
    `menu_id` in a grant is the stage id, so the Menu Access page can reuse the same table."""
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    roles = db.query(Role).filter(Role.is_active == True).order_by(Role.name).all()
    stages = workflow.stages
    stage_ids = [s.id for s in stages]
    rows = (
        db.query(workflow_stage_roles.c.stage_id, workflow_stage_roles.c.role_id)
        .filter(workflow_stage_roles.c.stage_id.in_(stage_ids))
        .all()
        if stage_ids
        else []
    )
    return AccessMatrix(
        roles=[AccessRole(id=r.id, name=r.name) for r in roles],
        screens=[AccessScreen(id=s.id, name=s.name, url="") for s in stages],
        grants=[AccessGrant(role_id=role_id, menu_id=stage_id) for stage_id, role_id in rows],
    )


@router.put("/workflow-stages", status_code=status.HTTP_204_NO_CONTENT)
def set_stage_access(
    payload: AccessUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Allow or revoke one role's access to one workflow stage (`menu_id` is the stage id)."""
    role = db.query(Role).filter(Role.id == payload.role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    stage = db.query(WorkflowStage).filter(WorkflowStage.id == payload.menu_id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    has = any(r.id == role.id for r in stage.roles)
    if payload.allowed and not has:
        stage.roles.append(role)
    elif not payload.allowed and has:
        stage.roles = [r for r in stage.roles if r.id != role.id]
    db.commit()
