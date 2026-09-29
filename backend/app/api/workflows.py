from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user, get_db, get_superuser
from app.models.workflow import Workflow, WorkflowLevel, WorkflowStage
from app.schemas.workflow import (
    LevelOut,
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


def _get_level_or_404(db: Session, workflow_id: int, level_id: int) -> WorkflowLevel:
    level = (
        db.query(WorkflowLevel)
        .filter(WorkflowLevel.id == level_id, WorkflowLevel.workflow_id == workflow_id)
        .first()
    )
    if not level:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Level not found")
    return level


# ── Workflows ────────────────────────────────────────────────────────────

@router.get("/", response_model=List[WorkflowDetailOut])
def list_workflows(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """List every workflow with its levels and stages nested, so the UI can
    render each workflow's stages inline without a follow-up request."""
    return (
        db.query(Workflow)
        .options(joinedload(Workflow.levels).joinedload(WorkflowLevel.stages))
        .order_by(Workflow.name)
        .all()
    )


@router.post("/", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
def create_workflow(
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
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
    _=Depends(get_current_user),
):
    workflow = (
        db.query(Workflow)
        .options(joinedload(Workflow.levels).joinedload(WorkflowLevel.stages))
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
    _=Depends(get_superuser),
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
    _=Depends(get_superuser),
):
    workflow = _get_workflow_or_404(db, workflow_id)
    db.delete(workflow)
    db.commit()


# ── Levels ───────────────────────────────────────────────────────────────

@router.post("/{workflow_id}/levels", response_model=LevelOut, status_code=status.HTTP_201_CREATED)
def create_level(
    workflow_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    _get_workflow_or_404(db, workflow_id)
    last_order = (
        db.query(WorkflowLevel)
        .filter(WorkflowLevel.workflow_id == workflow_id)
        .order_by(WorkflowLevel.order.desc())
        .first()
    )
    next_order = (last_order.order + 1) if last_order else 1
    level = WorkflowLevel(workflow_id=workflow_id, order=next_order)
    db.add(level)
    db.commit()
    db.refresh(level)
    return level


@router.delete("/{workflow_id}/levels/{level_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_level(
    workflow_id: int,
    level_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    level = _get_level_or_404(db, workflow_id, level_id)
    db.delete(level)
    db.commit()


# ── Stages ───────────────────────────────────────────────────────────────

@router.post(
    "/{workflow_id}/levels/{level_id}/stages",
    response_model=StageOut,
    status_code=status.HTTP_201_CREATED,
)
def create_stage(
    workflow_id: int,
    level_id: int,
    payload: StageCreate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    _get_level_or_404(db, workflow_id, level_id)
    stage = WorkflowStage(level_id=level_id, **payload.model_dump())
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


@router.put("/{workflow_id}/levels/{level_id}/stages/{stage_id}", response_model=StageOut)
def update_stage(
    workflow_id: int,
    level_id: int,
    stage_id: int,
    payload: StageUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    _get_level_or_404(db, workflow_id, level_id)
    stage = db.query(WorkflowStage).filter(
        WorkflowStage.id == stage_id, WorkflowStage.level_id == level_id
    ).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(stage, key, value)

    db.commit()
    db.refresh(stage)
    return stage


@router.delete("/{workflow_id}/levels/{level_id}/stages/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(
    workflow_id: int,
    level_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    _get_level_or_404(db, workflow_id, level_id)
    stage = db.query(WorkflowStage).filter(
        WorkflowStage.id == stage_id, WorkflowStage.level_id == level_id
    ).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    db.delete(stage)
    db.commit()
