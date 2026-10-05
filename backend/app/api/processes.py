from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_superuser, get_current_user, require_screen
from app.core.builtin_screens import MENU_ACCESS_SCREEN, PROTECTED_PROCESS_NAMES
from app.models.process import Process
from app.schemas.process import ProcessCreate, ProcessOut, ProcessReorderItem, ProcessUpdate

router = APIRouter()


def _renumber_active_processes(db: Session) -> None:
    """Keep order gap-free (1, 2, 3, ...) among active processes, in their current relative order.
    Called whenever a process leaves the active list, so deleting #2 of 3 makes the old #3 become #2
    instead of leaving a hole. This session has autoflush off, so the caller's own pending change (e.g.
    is_active = False) needs an explicit flush before the query below can see it."""
    db.flush()
    active = db.query(Process).filter(Process.is_active == True).order_by(Process.order, Process.name).all()
    for i, p in enumerate(active, start=1):
        if p.order != i:
            p.order = i


@router.get("/", response_model=List[ProcessOut])
def list_processes(
    db: Session = Depends(get_db),
    # Router Setup (superusers) and the Menu Access process dropdown use this list.
    _=Depends(require_screen(MENU_ACCESS_SCREEN)),
):
    """List all active processes."""
    return db.query(Process).filter(Process.is_active == True).order_by(Process.order, Process.name).all()


@router.post("/", response_model=ProcessOut, status_code=status.HTTP_201_CREATED)
def create_process(
    payload: ProcessCreate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Create a new process."""
    existing = db.query(Process).filter(Process.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A process with this name already exists",
        )

    data = payload.model_dump()
    if data.get("order") is None:
        data["order"] = (db.query(func.max(Process.order)).scalar() or 0) + 1
    process = Process(**data)
    db.add(process)
    db.commit()
    db.refresh(process)
    return process


@router.put("/reorder", status_code=status.HTTP_200_OK)
def reorder_processes(
    payload: List[ProcessReorderItem],
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Bulk update the order of processes (drag-and-drop in Router Setup)."""
    for item in payload:
        db.query(Process).filter(Process.id == item.id).update({"order": item.order})
    db.info.setdefault("live_kinds", set()).add("access")
    db.commit()
    return {"message": "Reordered successfully"}


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
    if process.name in PROTECTED_PROCESS_NAMES:
        if update_data.get("is_active") is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This process cannot be deactivated")
        if "name" in update_data and update_data["name"] != process.name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This process cannot be renamed")

    if "name" in update_data and update_data["name"] != process.name:
        existing = db.query(Process).filter(
            Process.id != process_id, Process.name == update_data["name"]
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A process with this name already exists",
            )

    was_active = process.is_active
    for key, value in update_data.items():
        setattr(process, key, value)
    if was_active and process.is_active is False:
        _renumber_active_processes(db)

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
    if process.name in PROTECTED_PROCESS_NAMES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This process cannot be deleted")

    process.is_active = False
    _renumber_active_processes(db)
    db.commit()
