from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.bigbasket import BatchImageDetailOut
from app.services.bigbasket.bg_only_processor import BgOnlyProcessor

router = APIRouter()


@router.post("/{image_id}/bg-remove", response_model=BatchImageDetailOut)
async def bg_remove_image(
    image_id: int,
    provider: Literal["birefnet", "photoroom"] = Query("birefnet"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-runs background removal and standardization for one image, skipping image classification."""
    try:
        img = await BgOnlyProcessor.run(db, image_id, provider=provider)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"BG Remove failed: {str(e)}")
    setattr(img, "validation_status", img.validation_results)
    return img
