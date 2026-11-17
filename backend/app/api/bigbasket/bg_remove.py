from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.core.logger import logger
from app.models.bigbasket import BatchImage
from app.models.user import User
from app.schemas.bigbasket import BatchImageDetailOut

router = APIRouter()


@router.post("/{image_id}/bg-remove", response_model=BatchImageDetailOut)
async def bg_remove_image(
    image_id: int,
    provider: Literal["birefnet", "photoroom"] = Query("birefnet"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-runs background removal and standardization for one image, skipping image classification.
    Dispatches to Celery background worker / Redis for concurrent multi-processing.
    """
    img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    img.status = "processing"
    img.error_message = None
    db.commit()
    db.refresh(img)

    try:
        from app.tasks.batch_tasks import dispatch_single_image_task
        dispatch_single_image_task(image_id, provider=provider, skip_classification=True)
    except Exception as exc:
        logger.warning(f"Failed to dispatch single image task {image_id}: {exc}")

    setattr(img, "validation_status", img.validation_results)
    return img
