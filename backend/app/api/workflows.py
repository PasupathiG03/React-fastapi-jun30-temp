from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, get_superuser
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate, WorkflowOut, WorkflowUpdate

router = APIRouter()


def _get_workflow_or_404(db: Session, workflow_id: int) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


# ── Workflows ────────────────────────────────────────────────────────────

@router.get("/", response_model=List[WorkflowOut])
def list_workflows(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return db.query(Workflow).order_by(Workflow.name).all()


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


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return _get_workflow_or_404(db, workflow_id)


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
