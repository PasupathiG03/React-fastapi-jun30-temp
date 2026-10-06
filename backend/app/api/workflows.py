from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user, get_db, has_full_access, require_screen
from app.core.builtin_screens import MENU_ACCESS_SCREEN, WORKFLOW_SCREEN
from app.models.role import Role
from app.models.workflow import StageType, Workflow, WorkflowStage
from app.schemas.workflow import (
    CopyAccess,
    MyWorkflowOut,
    StageAccessOut,
    StageCreate,
    StageOut,
    StageUpdate,
    WorkflowCreate,
    WorkflowDetailOut,
    WorkflowOut,
    WorkflowUpdate,
)

router = APIRouter()


def _get_workflow_or_404(db: Session, workflow_id: int) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


def _is_developer(user) -> bool:
    return has_full_access(user)


def _validated_role_ids(db: Session, role_ids: list[int]) -> list[int]:
    """The given ids, de-duplicated and sorted, after checking every one of them is a real role."""
    ids = sorted(set(role_ids))
    if not ids:
        return []
    found = db.query(Role.id).filter(Role.id.in_(ids)).count()
    if found != len(ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more roles do not exist")
    return ids


def _with_admin(db: Session, role_ids: list[int]) -> list[int]:
    """Every stage is created with the Admin role on it, whatever the caller picked. It can still be
    removed afterwards from Menu Access or by editing the stage."""
    admin = db.query(Role.id).filter(func.lower(Role.name) == "admin", Role.is_active == True).first()
    if admin is None or admin.id in role_ids:
        return role_ids
    return [*role_ids, admin.id]


def _user_can_open(user, stage: WorkflowStage) -> bool:
    return _is_developer(user) or (user.role_id is not None and user.role_id in stage.role_ids)


# ── Workflows ────────────────────────────────────────────────────────────

@router.get("/my-stages", response_model=List[MyWorkflowOut])
def my_stages(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Active workflows with only the stages the current user's role may open.
    Developers get everything. Workflows with no visible stage are left out."""
    workflows = (
        db.query(Workflow)
        .options(joinedload(Workflow.stages))
        .filter(Workflow.is_active == True)
        .order_by(Workflow.name)
        .all()
    )
    result = []
    for w in workflows:
        stages = [s for s in w.stages if _user_can_open(current_user, s)]
        if stages:
            result.append(MyWorkflowOut(id=w.id, name=w.name, stages=stages))
    return result


@router.get("/", response_model=List[WorkflowDetailOut])
def list_workflows(
    db: Session = Depends(get_db),
    # Menu Access also lists workflows in its dropdown.
    _=Depends(require_screen(WORKFLOW_SCREEN, MENU_ACCESS_SCREEN)),
):
    """List every workflow with its stages nested, so the UI can
    render each workflow's stages inline without a follow-up request."""
    return (
        db.query(Workflow)
        .options(joinedload(Workflow.stages))
        .order_by(Workflow.name)
        .all()
    )


@router.post("/", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
def create_workflow(
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    existing = db.query(Workflow).filter(Workflow.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A workflow with this name already exists",
        )
    workflow = Workflow(name=payload.name)
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


@router.get("/{workflow_id}", response_model=WorkflowDetailOut)
def get_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    workflow = (
        db.query(Workflow)
        .options(joinedload(Workflow.stages))
        .filter(Workflow.id == workflow_id)
        .first()
    )
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


@router.put("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(
    workflow_id: int,
    payload: WorkflowUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    workflow = _get_workflow_or_404(db, workflow_id)

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != workflow.name:
        existing = db.query(Workflow).filter(
            Workflow.id != workflow_id, Workflow.name == update_data["name"]
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A workflow with this name already exists",
            )

    for key, value in update_data.items():
        setattr(workflow, key, value)

    db.commit()
    db.refresh(workflow)
    return workflow


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    workflow = _get_workflow_or_404(db, workflow_id)
    db.delete(workflow)
    db.commit()


@router.post("/{workflow_id}/copy-access", response_model=WorkflowDetailOut)
def copy_access(
    workflow_id: int,
    payload: CopyAccess,
    db: Session = Depends(get_db),
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    """Copy which roles may open each stage from another workflow.

    Stages are matched by type, in order: the 1st QC stage here takes the roles of the 1st QC stage
    in the source, and so on. If this workflow has more stages of a type than the source, the extra
    ones reuse the source's last stage of that type. A stage whose type the source lacks is left as is."""
    if payload.source_workflow_id == workflow_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pick a different workflow to copy from")
    target = _get_workflow_or_404(db, workflow_id)
    source = _get_workflow_or_404(db, payload.source_workflow_id)

    source_by_type: dict[StageType, list[WorkflowStage]] = {}
    for s in source.stages:
        source_by_type.setdefault(s.stage_type, []).append(s)

    seen: dict[StageType, int] = {}
    for stage in target.stages:
        candidates = source_by_type.get(stage.stage_type)
        if not candidates:
            continue
        n = seen.get(stage.stage_type, 0)
        seen[stage.stage_type] = n + 1
        stage.role_ids = _with_admin(db, list(candidates[min(n, len(candidates) - 1)].role_ids))

    db.commit()
    db.refresh(target)
    return target


# ── Stages ───────────────────────────────────────────────────────────────

@router.post(
    "/{workflow_id}/stages",
    response_model=StageOut,
    status_code=status.HTTP_201_CREATED,
)
def create_stage(
    workflow_id: int,
    payload: StageCreate,
    db: Session = Depends(get_db),
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    _get_workflow_or_404(db, workflow_id)
    data = payload.model_dump(exclude={"role_ids"})
    role_ids = _with_admin(db, _validated_role_ids(db, payload.role_ids))
    stage = WorkflowStage(workflow_id=workflow_id, role_ids=role_ids, **data)
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


@router.put("/{workflow_id}/stages/{stage_id}", response_model=StageOut)
def update_stage(
    workflow_id: int,
    stage_id: int,
    payload: StageUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    _get_workflow_or_404(db, workflow_id)
    stage = db.query(WorkflowStage).filter(
        WorkflowStage.id == stage_id, WorkflowStage.workflow_id == workflow_id
    ).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    update_data = payload.model_dump(exclude_unset=True)
    role_ids = update_data.pop("role_ids", None)
    for key, value in update_data.items():
        setattr(stage, key, value)
    if role_ids is not None:
        stage.role_ids = _validated_role_ids(db, role_ids)

    db.commit()
    db.refresh(stage)
    return stage


@router.get("/{workflow_id}/stages/{stage_id}", response_model=StageAccessOut)
def get_stage(
    workflow_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """A single stage's configuration."""
    workflow = _get_workflow_or_404(db, workflow_id)
    stage = next((s for s in workflow.stages if s.id == stage_id), None)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    if not workflow.is_active and not _is_developer(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    if not _user_can_open(current_user, stage):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this stage")
    return StageAccessOut(
        id=stage.id,
        name=stage.name,
        stage_type=stage.stage_type,
        sequence_order=stage.sequence_order,
        total_stages=len(workflow.stages),
        is_first=stage.id == workflow.stages[0].id,
        is_last=stage.id == workflow.stages[-1].id,
        workflow_id=workflow.id,
        workflow_name=workflow.name,
        role_names=sorted(
            row.name for row in db.query(Role.name).filter(Role.id.in_(stage.role_ids)).all()
        ) if stage.role_ids else [],
    )


@router.delete("/{workflow_id}/stages/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(
    workflow_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    _get_workflow_or_404(db, workflow_id)
    stage = db.query(WorkflowStage).filter(
        WorkflowStage.id == stage_id, WorkflowStage.workflow_id == workflow_id
    ).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    db.delete(stage)
    db.commit()
