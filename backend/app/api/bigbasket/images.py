import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.bigbasket import BatchImage, ImageVersion
from app.models.user import User
from app.schemas.bigbasket import BatchImageDetailOut, BatchImageOut, ImageListResponse
from app.services.bigbasket.pipeline import PipelineService

router = APIRouter()


class RepadPayload(BaseModel):
    top: int = 180
    bottom: int = 180
    left: int = 100
    right: int = 100


@router.get("/batch/{batch_id}", response_model=ImageListResponse)
def list_batch_images(
    batch_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(BatchImage).filter(BatchImage.batch_id == batch_id)

    if status_filter:
        query = query.filter(BatchImage.status == status_filter)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(BatchImage.bbid.ilike(s) | BatchImage.original_filename.ilike(s))

    total = query.count()
    images = query.order_by(BatchImage.sequence_order, BatchImage.id).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": images,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{image_id}", response_model=BatchImageDetailOut)
def get_image_details(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    # Attach latest real validation result if available
    latest_val = img.validation_results[-1] if img.validation_results else None
    setattr(img, "validation_status", latest_val)
    return img


@router.get("/{image_id}/file")
def stream_image_file(
    image_id: int,
    variant: str = Query("original"),  # original, final, segmented
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    target_path = None
    if variant == "final" and img.final_output_path:
        target_path = Path(img.final_output_path)
    elif variant == "segmented":
        for v in img.versions:
            if v.version_type == "segmented":
                target_path = Path(v.file_path)
                break
    else:
        target_path = Path(img.original_file_path)

    if not target_path or not target_path.exists():
        # Fallback to original
        target_path = Path(img.original_file_path)

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Image asset file not found on disk.")

    media_type = "image/png" if target_path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(target_path, media_type=media_type)


@router.post("/{image_id}/repad")
def reapply_padding_endpoint(
    image_id: int,
    payload: RepadPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    source_path = None
    for v in img.versions:
        if v.version_type == "segmented":
            source_path = Path(v.file_path)
            break
    if not source_path or not source_path.exists():
        if img.final_output_path and Path(img.final_output_path).exists():
            source_path = Path(img.final_output_path)
        else:
            source_path = Path(img.original_file_path)

    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source image file not found on disk")

    with open(source_path, "rb") as f:
        src_bytes = f.read()

    new_png_bytes = PipelineService.reapply_padding(
        image_bytes=src_bytes,
        padding_cfg={"top": payload.top, "bottom": payload.bottom, "left": payload.left, "right": payload.right},
        image_type=img.image_type,
    )

    if not img.final_output_path:
        out_dir = Path("storage/bigbasket/processed")
        out_dir.mkdir(parents=True, exist_ok=True)
        img.final_output_path = str(out_dir / f"{img.id}_final.png")
    else:
        Path(img.final_output_path).parent.mkdir(parents=True, exist_ok=True)

    with open(img.final_output_path, "wb") as f:
        f.write(new_png_bytes)

    for v in img.versions:
        v.is_current = False

    new_version = ImageVersion(
        image_id=img.id,
        version_type="repad",
        file_path=img.final_output_path,
        width=2000,
        height=2000,
        file_size_bytes=len(new_png_bytes),
        is_current=True,
    )
    db.add(new_version)
    db.commit()

    return {"message": "Padding re-applied successfully"}

