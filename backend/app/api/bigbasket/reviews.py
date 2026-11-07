from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.bigbasket import BatchImage, ImageBatch
from app.models.user import User
from app.schemas.bigbasket import (
    BulkReviewActionRequest,
    ImageListResponse,
    ReviewActionRequest,
)

router = APIRouter()


@router.get("/queue", response_model=ImageListResponse)
def get_review_queue(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    batch_id: Optional[int] = Query(None),
    min_confidence: Optional[float] = Query(None),
    max_confidence: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(BatchImage).filter(BatchImage.status.in_(["needs_review", "failed"]))

    if batch_id:
        query = query.filter(BatchImage.batch_id == batch_id)
    if min_confidence is not None:
        query = query.filter(BatchImage.confidence_score >= min_confidence)
    if max_confidence is not None:
        query = query.filter(BatchImage.confidence_score <= max_confidence)

    total = query.count()
    images = query.order_by(BatchImage.confidence_score.asc(), BatchImage.id).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": images,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/{image_id}/action")
def submit_review_action(
    image_id: int,
    payload: ReviewActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    img.review_decision = payload.decision
    img.reviewer_id = current_user.id
    img.review_comments = payload.comments
    img.reviewed_at = datetime.now(timezone.utc)

    if payload.decision == "approved":
        img.status = "manually_approved"
    elif payload.decision == "rejected":
        img.status = "rejected"
    elif payload.decision == "reprocess":
        img.status = "pending"

    db.commit()

    # Update parent batch counters
    batch = db.query(ImageBatch).filter(ImageBatch.id == img.batch_id).first()
    if batch:
        batch.approved_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status.in_(["auto_approved", "manually_approved"]),
        ).count()
        batch.review_needed_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status == "needs_review",
        ).count()
        db.commit()

    return {"message": f"Review action '{payload.decision}' recorded successfully.", "status": img.status}


@router.post("/bulk-action")
def submit_bulk_review(
    payload: BulkReviewActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    images = db.query(BatchImage).filter(BatchImage.id.in_(payload.image_ids)).all()
    if not images:
        raise HTTPException(status_code=404, detail="No matching images found")

    now = datetime.now(timezone.utc)
    new_status = "manually_approved" if payload.decision == "approved" else "rejected"

    for img in images:
        img.review_decision = payload.decision
        img.reviewer_id = current_user.id
        img.review_comments = payload.comments
        img.reviewed_at = now
        img.status = new_status

    db.commit()
    return {"message": f"Bulk {payload.decision} applied to {len(images)} images."}
