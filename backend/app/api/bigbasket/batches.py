import asyncio
import secrets
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.bigbasket import BatchEvent, ImageBatch
from app.models.user import User
from app.schemas.bigbasket import (
    BatchCreate,
    BatchListResponse,
    BatchOut,
    BatchStatusUpdate,
    BatchUpdate,
)
from app.services.bigbasket.batch_processor import BatchProcessor
from app.services.bigbasket.storage import BigBasketStorage

router = APIRouter()


@router.get("/", response_model=BatchListResponse)
def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ImageBatch)
    if status_filter:
        query = query.filter(ImageBatch.status == status_filter)

    total = query.count()
    batches = query.order_by(ImageBatch.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": batches,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/", response_model=BatchOut, status_code=status.HTTP_201_CREATED)
def create_batch(
    payload: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check idempotency key if provided
    if payload.idempotency_key:
        existing = db.query(ImageBatch).filter(ImageBatch.idempotency_key == payload.idempotency_key).first()
        if existing:
            return existing

    # Generate unique human-readable batch code: BATCH-YYYYMMDD-XXXX
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_suffix = secrets.token_hex(2).upper()
    batch_code = f"BATCH-{date_str}-{random_suffix}"

    # Default configuration
    cfg = payload.config.model_dump() if payload.config else {
        "canvas_width": 2000,
        "canvas_height": 2000,
        "dpi": 150,
        "fop_bop_padding": {"top": 180, "bottom": 180, "left": 100, "right": 100},
        "confidence_threshold": 0.95,
        "auto_inpaint_mrp": True,
        "max_workers": 4,
        "chunk_size": 10,
    }

    batch = ImageBatch(
        batch_code=batch_code,
        name=payload.name,
        source_type=payload.source_type,
        status="created",
        idempotency_key=payload.idempotency_key,
        config=cfg,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    # Initialize storage folder
    BigBasketStorage.get_batch_dir(batch_code)

    # Log creation event
    ev = BatchEvent(
        batch_id=batch.id,
        event_type="created",
        message=f"Batch {batch_code} created by {current_user.employee_id}.",
    )
    db.add(ev)
    db.commit()

    return batch


@router.get("/{batch_id}", response_model=BatchOut)
def get_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


@router.post("/{batch_id}/start")
async def start_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status == "processing":
        return {"message": "Batch is already processing", "status": batch.status}

    # Launch background processing task
    asyncio.create_task(BatchProcessor.process_batch_background(batch_id))

    return {"message": "Batch processing started", "status": "processing"}


@router.post("/{batch_id}/pause")
def pause_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    BatchProcessor.request_pause(batch_id)
    return {"message": "Pause requested for batch", "status": "paused"}


@router.post("/{batch_id}/resume")
def resume_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    BatchProcessor.resume(batch_id)
    if batch.status in ("paused", "failed"):
        asyncio.create_task(BatchProcessor.process_batch_background(batch_id))

    return {"message": "Resumed batch processing", "status": "processing"}


@router.post("/{batch_id}/cancel")
def cancel_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    BatchProcessor.request_cancel(batch_id)
    batch.status = "cancelled"
    db.commit()
    return {"message": "Batch cancelled", "status": "cancelled"}


@router.delete("/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    BigBasketStorage.clean_batch(batch.batch_code)
    db.delete(batch)
    db.commit()
    return None

