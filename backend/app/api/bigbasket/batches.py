import asyncio
import secrets
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user, get_db
from app.core.logger import logger
from app.models.bigbasket import ImageBatch
from app.models.user import User
from app.schemas.bigbasket import (
    BatchCreate,
    BatchListResponse,
    BatchOut,
)
from app.services.app_settings import SettingsNotConfigured, require_output_preset
from app.services.bigbasket.batch_processor import BatchProcessor
from app.services.bigbasket.events import BigBasketEventBroadcaster
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
    query = db.query(ImageBatch).options(joinedload(ImageBatch.creator))  # uploader name, without a query per row
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

    # Default configuration. Canvas size, DPI and padding come from the Image Automation output preset
    # unless the request sets them explicitly.
    cfg = payload.config.model_dump() if payload.config else {
        "confidence_threshold": 0.95,
        "classification_confidence_threshold": 0.90,
        "extract_sub_regions": True,
        "auto_inpaint_mrp": True,
        "max_workers": 4,
    }

    preset_keys = ("canvas_width", "canvas_height", "dpi", "fop_bop_padding")
    missing = [k for k in preset_keys if cfg.get(k) is None]
    if missing:
        try:
            preset = require_output_preset(db)
        except SettingsNotConfigured as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        for key in ("canvas_width", "canvas_height", "dpi"):
            if cfg.get(key) is None:
                cfg[key] = preset[key]
        if cfg.get("fop_bop_padding") is None:
            cfg["fop_bop_padding"] = dict(preset["padding"])

    # 1. Allocate batch in DB with temporary code to obtain auto-increment primary key ID
    temp_code = f"TEMP-{secrets.token_hex(4)}"
    batch = ImageBatch(
        batch_code=temp_code,
        name=payload.name,
        source_type=payload.source_type,
        status="created",
        idempotency_key=payload.idempotency_key,
        config=cfg,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(batch)
    db.flush()

    # 2. Auto-generate Extraction Batch ID based on DB index: IS-BATCH<id based db index>
    batch_code = f"IS-BATCH-{batch.id:03d}"
    batch.batch_code = batch_code
    db.commit()
    db.refresh(batch)

    # Initialize storage folder under uploads/<dd-mm-yyyy>/<batch_name>_<batch_id>/
    BigBasketStorage.get_batch_dir(batch)

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


def dispatch_batch_processing(batch_id: int):
    """Dispatches batch processing to Celery background worker if available.
    Falls back gracefully to a detached daemon thread so Uvicorn's asyncio event loop
    is NEVER blocked even if Redis/Celery is temporarily offline.
    """
    dispatched = False
    try:
        from app.tasks.batch_tasks import process_batch_task
        task = process_batch_task.delay(batch_id)
        logger.info(f"Dispatched batch {batch_id} to Celery worker (Task ID: {task.id})")
        dispatched = True
    except Exception as exc:
        logger.warning(f"Celery dispatch failed for batch {batch_id} ({exc}); falling back to background thread.")

    if not dispatched:
        import threading
        def _run_in_thread():
            asyncio.run(BatchProcessor.process_batch_background(batch_id))
        t = threading.Thread(target=_run_in_thread, daemon=True, name=f"batch-thread-{batch_id}")
        t.start()
        logger.info(f"Started batch {batch_id} in detached daemon thread.")


@router.post("/{batch_id}/start")
async def start_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status in ("queued", "processing"):
        return {"message": f"Batch is already {batch.status}", "status": batch.status}

    # Mark it queued before dispatch: the worker flips it to "processing" only when it actually picks the task
    # up, so without this a batch waiting behind others still looks "created" and can be started twice.
    batch.status = "queued"
    db.commit()

    # Dispatch to Celery background worker (or detached daemon thread)
    dispatch_batch_processing(batch_id)

    return {"message": "Batch queued for processing", "status": "queued"}


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
        batch.status = "queued"
        db.commit()
        dispatch_batch_processing(batch_id)

    return {"message": "Resumed batch processing", "status": batch.status}


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

    if batch.status == "processing":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a batch that is currently processing. Please cancel or pause it first.",
        )

    BatchProcessor.request_cancel(batch_id)
    BigBasketStorage.clean_batch(batch.batch_code)
    db.delete(batch)
    db.commit()
    return None


@router.post("/{batch_id}/retry-failed")
async def retry_batch_failed(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retries all images in a batch with status 'needs_review' or 'failed' through Photoroom AI.
    """
    try:
        retried = await BatchProcessor.retry_batch_failed_images(db, batch_id)
        return {"message": f"Retried {len(retried)} images with Photoroom", "count": len(retried)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Photoroom retry failed: {str(e)}")


@router.post("/{batch_id}/rerun")
async def rerun_batch(
    batch_id: int,
    provider: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reruns the entire batch from scratch with a single button click by resetting all images
    to pending and dispatching background processing.
    """
    try:
        batch = BatchProcessor.rerun_entire_batch(db, batch_id, provider=provider)
        dispatch_batch_processing(batch_id)

        await BigBasketEventBroadcaster.publish_event({
            "type": "batch_status",
            "batch_id": batch_id,
            "status": "queued",
            "progress_pct": 0,
        })

        return {
            "message": f"Rerun started for entire batch {batch.batch_code} ({batch.total_images} images)",
            "batch_id": batch.id,
            "status": "queued",
            "count": batch.total_images,
        }
    except ValueError as e:
        status_code = 404 if "not found" in str(e).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to rerun batch {batch_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to rerun batch: {str(e)}")



