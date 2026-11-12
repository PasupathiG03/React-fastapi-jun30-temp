import io
import zipfile
from pathlib import Path
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.services.bigbasket.image_inspector import (
    DEFAULT_MIN_HEIGHT,
    DEFAULT_MIN_WIDTH,
    inspect_image_bytes,
)

router = APIRouter()


@router.post("/images")
async def inspect_uploaded_images(
    files: List[UploadFile] = File(...),
    min_width: int = Query(DEFAULT_MIN_WIDTH, ge=1, description="Minimum required width in px"),
    min_height: int = Query(DEFAULT_MIN_HEIGHT, ge=1, description="Minimum required height in px"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pre-upload inspection endpoint for multiple image files.
    Checks:
    1. Dimensions >= min_width x min_height (default 1080 x 1440 px).
    2. OCR detection of any '100%' claim on the product.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided for inspection.")

    results: List[Dict[str, Any]] = []
    has_any_invalid_dimension = False
    has_any_hundred_percent = False

    for file in files:
        filename = Path(file.filename).name
        if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue

        content = await file.read()
        inspection = inspect_image_bytes(
            content,
            filename=filename,
            min_width=min_width,
            min_height=min_height,
        )

        if not inspection["is_dimension_valid"]:
            has_any_invalid_dimension = True
        if inspection["has_hundred_percent"]:
            has_any_hundred_percent = True

        results.append(inspection)

    return {
        "total_inspected": len(results),
        "required_width": min_width,
        "required_height": min_height,
        "has_any_invalid_dimension": has_any_invalid_dimension,
        "has_any_hundred_percent": has_any_hundred_percent,
        "items": results,
    }


@router.post("/zip")
async def inspect_uploaded_zip(
    file: UploadFile = File(...),
    min_width: int = Query(DEFAULT_MIN_WIDTH, ge=1, description="Minimum required width in px"),
    min_height: int = Query(DEFAULT_MIN_HEIGHT, ge=1, description="Minimum required height in px"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pre-upload inspection endpoint for a ZIP archive.
    Extracts images in-memory and checks:
    1. Dimensions >= min_width x min_height (default 1080 x 1440 px).
    2. OCR detection of any '100%' claims.
    """
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive.")

    content = await file.read()
    results: List[Dict[str, Any]] = []
    has_any_invalid_dimension = False
    has_any_hundred_percent = False

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for name in zf.namelist():
                if name.endswith("/") or name.startswith("__MACOSX"):
                    continue
                if name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    data = zf.read(name)
                    filename = Path(name).name
                    inspection = inspect_image_bytes(
                        data,
                        filename=filename,
                        min_width=min_width,
                        min_height=min_height,
                    )

                    if not inspection["is_dimension_valid"]:
                        has_any_invalid_dimension = True
                    if inspection["has_hundred_percent"]:
                        has_any_hundred_percent = True

                    results.append(inspection)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Corrupted or invalid ZIP file.")

    return {
        "total_inspected": len(results),
        "required_width": min_width,
        "required_height": min_height,
        "has_any_invalid_dimension": has_any_invalid_dimension,
        "has_any_hundred_percent": has_any_hundred_percent,
        "items": results,
    }

