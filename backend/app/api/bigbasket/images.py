from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.bigbasket import BatchImage
from app.models.user import User
from app.schemas.bigbasket import BatchImageDetailOut, ImageListResponse
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

    for img in images:
        if not getattr(img, "validation_status", None):
            setattr(img, "validation_status", img.validation_results)
        val = img.validation_results or {}
        cat = val.get("product_category") or (val.get("gemini_classification") or {}).get("primary_category")
        setattr(img, "product_category", cat)

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
    # Expose validation_status alias pointing to validation_results dictionary
    setattr(img, "validation_status", img.validation_results)
    val = img.validation_results or {}
    cat = val.get("product_category") or (val.get("gemini_classification") or {}).get("primary_category")
    setattr(img, "product_category", cat)
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

    # An auto-extracted crop (Ingredients, Nutritional, FSSAI...) has no upload of its own: its "original" is the
    # uploaded back-of-pack image it was cut from, shown exactly as uploaded, never the cut-out strip.
    parent_id = (img.validation_results or {}).get("auto_extracted_from")
    if variant == "original" and parent_id:
        parent = db.query(BatchImage).filter(BatchImage.id == parent_id).first()
        if parent and parent.original_file_path and Path(parent.original_file_path).exists():
            img = parent

    target_path = None
    if variant == "final" and img.final_output_path:
        target_path = Path(img.final_output_path)
    elif variant == "segmented" and img.segmented_file_path:
        target_path = Path(img.segmented_file_path)
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
    if img.segmented_file_path and Path(img.segmented_file_path).exists():
        source_path = Path(img.segmented_file_path)
    elif img.final_output_path and Path(img.final_output_path).exists():
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
        out_dir = Path("uploads/processed")
        out_dir.mkdir(parents=True, exist_ok=True)
        img.final_output_path = str(out_dir / f"{img.id}_final.png")
    else:
        Path(img.final_output_path).parent.mkdir(parents=True, exist_ok=True)

    with open(img.final_output_path, "wb") as f:
        f.write(new_png_bytes)

    db.commit()
    return {"message": "Padding re-applied successfully"}


@router.post("/{image_id}/retry", response_model=BatchImageDetailOut)
async def retry_image_processing(
    image_id: int,
    provider: str = Query("photoroom"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retries background removal and standardization for an individual image
    using the specified provider ('photoroom' or 'rmbg2').
    """
    try:
        from app.services.bigbasket.batch_processor import BatchProcessor
        img = await BatchProcessor.retry_single_image(db, image_id, provider=provider)
        setattr(img, "validation_status", img.validation_results)
        return img
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Background removal retry failed: {str(e)}")


class UpdateCategoryPayload(BaseModel):
    product_category: str  # "FOOD", "NON_FOOD", "KITCHEN_ITEMS"


@router.post("/{image_id}/update-category", response_model=BatchImageDetailOut)
def update_image_product_category(
    image_id: int,
    payload: UpdateCategoryPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates the product category (FOOD, NON_FOOD, or KITCHEN_ITEMS) for an image and all sibling
    images sharing the same BBID, re-evaluating category compliance and exemptions.
    """
    cat = payload.product_category.upper().strip()
    if cat in ("NON-FOOD", "NONFOOD"):
        cat = "NON_FOOD"
    elif cat in ("KITCHEN", "KITCHEN ITEMS", "KITCHEN-ITEMS"):
        cat = "KITCHEN_ITEMS"

    if cat not in ("FOOD", "NON_FOOD", "KITCHEN_ITEMS"):
        raise HTTPException(status_code=400, detail="Category must be 'FOOD', 'NON_FOOD', or 'KITCHEN_ITEMS'")

    img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    # Update all images for this BBID in the batch
    sibling_imgs = db.query(BatchImage).filter(
        BatchImage.batch_id == img.batch_id,
        BatchImage.bbid == img.bbid,
    ).all()

    is_food = (cat == "FOOD")
    is_kitchen = (cat == "KITCHEN_ITEMS")

    for item in sibling_imgs:
        v = dict(item.validation_results or {})
        v["product_category"] = cat
        v["category_exemptions"] = {
            "fssai_exempt": not is_food,
            "nutrition_exempt": not is_food,
            "veg_nonveg_exempt": not is_food,
        }
        fpa = dict(v.get("five_point_audit") or {})
        fpa["category_compliance"] = {
            "product_category": cat,
            "fssai_applicable": is_food,
            "nutrition_applicable": is_food,
            "kitchen_rules_active": is_kitchen,
            "notes": (
                "Food product: FSSAI & Nutritional validation enabled" if is_food
                else "Kitchen item: Metal sheen, glass structure & narrow handle preservation active" if is_kitchen
                else "Non-food product: Directions, Material Composition, & Safety warnings active"
            ),
        }
        v["five_point_audit"] = fpa
        item.validation_results = v

    db.commit()
    db.refresh(img)
    setattr(img, "validation_status", img.validation_results)
    setattr(img, "product_category", cat)
    return img


