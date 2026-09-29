from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_superuser, get_current_user
from app.models.process import Process
from app.schemas.process import ProcessCreate, ProcessOut, ProcessUpdate

router = APIRouter()


@router.get("/", response_model=List[ProcessOut])
def list_processes(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all active processes."""
    return db.query(Process).filter(Process.is_active == True).order_by(Process.name).all()


@router.post("/", response_model=ProcessOut, status_code=status.HTTP_201_CREATED)
def create_process(
    payload: ProcessCreate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Create a new process."""
    existing = db.query(Process).filter(
        (Process.name == payload.name) | (Process.code == payload.code)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A process with this name or code already exists",
        )

    process = Process(**payload.model_dump())
    db.add(process)
    db.commit()
    db.refresh(process)
    return process


@router.put("/{process_id}", response_model=ProcessOut)
def update_process(
    process_id: int,
    payload: ProcessUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Update a process."""
    process = db.query(Process).filter(Process.id == process_id).first()
    if not process:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")

    update_data = payload.model_dump(exclude_unset=True)
    if ("name" in update_data and update_data["name"] != process.name) or (
        "code" in update_data and update_data["code"] != process.code
    ):
        existing = db.query(Process).filter(
            Process.id != process_id,
            (Process.name == update_data.get("name", process.name))
            | (Process.code == update_data.get("code", process.code)),
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A process with this name or code already exists",
            )

    for key, value in update_data.items():
        setattr(process, key, value)

    db.commit()
    db.refresh(process)
    return process


@router.delete("/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_process(
    process_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Soft delete a process by setting is_active to False."""
    process = db.query(Process).filter(Process.id == process_id).first()
    if not process:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")

    process.is_active = False
    db.commit()
