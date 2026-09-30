from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import WORKFLOW_SCREEN, get_current_user, get_db, require_screen
from app.models.role import Role
from app.models.workflow import Workflow, WorkflowItem, WorkflowItemHistory, WorkflowStage
from app.schemas.workflow import (
    ItemCreate,
    ItemHistoryOut,
    ItemMove,
    ItemOut,
    MyWorkflowOut,
    PendingStageOut,
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
    return bool(user.is_superuser or (user.role is not None and user.role.name == "Developer"))


def _roles_from_ids(db: Session, role_ids: list[int]) -> list[Role]:
    ids = sorted(set(role_ids))
    if not ids:
        return []
    roles = db.query(Role).filter(Role.id.in_(ids)).all()
    if len(roles) != len(ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more roles do not exist")
    return roles


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
    _=Depends(require_screen(WORKFLOW_SCREEN)),
):
    """List every workflow with its stages nested, so the UI can
    render each workflow's stages inline without a follow-up request."""
    return (
        db.query(Workflow)
        .options(joinedload(Workflow.stages))
        .order_by(Workflow.name)
        .all()
    )


@router.get("/pending", response_model=List[PendingStageOut])
def pending_by_stage(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Open-item counts for every stage the current user may open (drives the dashboard and the bell)."""
    counts = dict(
        db.query(WorkflowItem.current_stage_id, func.count(WorkflowItem.id))
        .filter(WorkflowItem.is_completed == False, WorkflowItem.current_stage_id.isnot(None))
        .group_by(WorkflowItem.current_stage_id)
        .all()
    )
    workflows = (
        db.query(Workflow)
        .options(joinedload(Workflow.stages))
        .filter(Workflow.is_active == True)
        .order_by(Workflow.name)
        .all()
    )
    return [
        PendingStageOut(
            workflow_id=w.id,
            workflow_name=w.name,
            stage_id=s.id,
            stage_name=s.name,
            stage_type=s.stage_type,
            sequence_order=s.sequence_order,
            count=counts.get(s.id, 0),
        )
        for w in workflows
        for s in w.stages
        if _user_can_open(current_user, s)
    ]


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
    stage = WorkflowStage(workflow_id=workflow_id, **data)
    stage.roles = _roles_from_ids(db, payload.role_ids)
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
        stage.roles = _roles_from_ids(db, role_ids)

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
    """A single stage for its workspace page. 403 unless the user's role is assigned to it."""
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
        role_names=sorted(r.name for r in stage.roles),
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
    if db.query(WorkflowItem.id).filter(WorkflowItem.current_stage_id == stage_id).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This stage still has items. Move them out before deleting it.",
        )
    db.delete(stage)
    db.commit()


# ── Items moving through stages ──────────────────────────────────────────

def _get_open_stage_for_user(db: Session, user, workflow_id: int, stage_id: int) -> WorkflowStage:
    """The stage, provided it belongs to the workflow and the user's role may open it."""
    workflow = _get_workflow_or_404(db, workflow_id)
    stage = next((s for s in workflow.stages if s.id == stage_id), None)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    if not _user_can_open(user, stage):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this stage")
    return stage


def _get_item_at_users_stage(db: Session, user, item_id: int) -> WorkflowItem:
    item = db.query(WorkflowItem).filter(WorkflowItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    if item.is_completed or item.current_stage is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This item is already completed")
    if not _user_can_open(user, item.current_stage):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This item is not at a stage you can work on")
    return item


def _log(db: Session, item: WorkflowItem, action: str, from_stage, to_stage, comment: str | None):
    db.add(
        WorkflowItemHistory(
            item_id=item.id,
            action=action,
            from_stage_id=from_stage.id if from_stage else None,
            to_stage_id=to_stage.id if to_stage else None,
            comment=(comment or "").strip() or None,
        )
    )


@router.get("/{workflow_id}/stages/{stage_id}/items", response_model=List[ItemOut])
def list_stage_items(
    workflow_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Open items currently sitting at this stage (oldest first)."""
    _get_open_stage_for_user(db, current_user, workflow_id, stage_id)
    return (
        db.query(WorkflowItem)
        .filter(WorkflowItem.workflow_id == workflow_id, WorkflowItem.current_stage_id == stage_id)
        .order_by(WorkflowItem.id)
        .all()
    )


@router.post("/{workflow_id}/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    workflow_id: int,
    payload: ItemCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Start a new item at the workflow's first stage (needs access to that stage)."""
    workflow = _get_workflow_or_404(db, workflow_id)
    if not workflow.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This workflow is inactive")
    if not workflow.stages:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This workflow has no stages yet")
    first = workflow.stages[0]
    if not _user_can_open(current_user, first):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the first stage can start new items")

    item = WorkflowItem(
        workflow_id=workflow_id,
        current_stage_id=first.id,
        title=payload.title,
        description=(payload.description or "").strip() or None,
    )
    db.add(item)
    db.flush()
    _log(db, item, "created", None, first, None)
    db.commit()
    db.refresh(item)
    return item


@router.post("/items/{item_id}/advance", response_model=ItemOut)
def advance_item(
    item_id: int,
    payload: ItemMove,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Send the item to the next stage, or complete it from the last stage."""
    item = _get_item_at_users_stage(db, current_user, item_id)
    stages = item.workflow.stages
    idx = next(i for i, s in enumerate(stages) if s.id == item.current_stage_id)
    current = stages[idx]
    if idx + 1 < len(stages):
        nxt = stages[idx + 1]
        item.current_stage_id = nxt.id
        _log(db, item, "advanced", current, nxt, payload.comment)
    else:
        item.current_stage_id = None
        item.is_completed = True
        _log(db, item, "completed", current, None, payload.comment)
    db.commit()
    db.refresh(item)
    return item


@router.post("/items/{item_id}/reject", response_model=ItemOut)
def reject_item(
    item_id: int,
    payload: ItemMove,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Send the item back to the previous stage. A comment explaining why is required."""
    if not (payload.comment or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please add a comment explaining why")
    item = _get_item_at_users_stage(db, current_user, item_id)
    stages = item.workflow.stages
    idx = next(i for i, s in enumerate(stages) if s.id == item.current_stage_id)
    if idx == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The first stage has nowhere to send back to")
    current, prev = stages[idx], stages[idx - 1]
    item.current_stage_id = prev.id
    _log(db, item, "rejected", current, prev, payload.comment)
    db.commit()
    db.refresh(item)
    return item


@router.get("/items/{item_id}/history", response_model=List[ItemHistoryOut])
def item_history(
    item_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Movement log of an item. Allowed for Developers and for roles that can open a stage the item has been in."""
    item = db.query(WorkflowItem).filter(WorkflowItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    # Allowed when the user can open the stage the item is at now, or one it has passed through.
    touched = {h.from_stage_id for h in item.history} | {h.to_stage_id for h in item.history} | {item.current_stage_id}
    if not any(_user_can_open(current_user, s) for s in item.workflow.stages if s.id in touched):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this item")
    return [
        ItemHistoryOut(
            id=h.id,
            action=h.action,
            from_stage_name=h.from_stage.name if h.from_stage else None,
            to_stage_name=h.to_stage.name if h.to_stage else None,
            comment=h.comment,
            created_at=h.created_at,
            actor=h.creator,
        )
        for h in item.history
    ]
