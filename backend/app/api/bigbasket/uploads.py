import io
import re
import zipfile
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.bigbasket import BatchImage, ImageBatch
from app.models.user import User
from app.services.bigbasket.storage import BigBasketStorage

router = APIRouter()


def parse_filename_bbid_and_seq(filename: str, fallback_seq: int = 1) -> tuple:
    """
    Dynamically auto-detects BBID / SKU identifier and sequence order from filename.
    Never hardcodes catalog view angles, product categories, or FOP/BOP assumptions;
    visual classification is left entirely to Gemini Multimodal Vision AI.
    """
    stem = Path(filename).stem.strip()
    if not stem:
        return f"ITEM_{fallback_seq}", fallback_seq, "unknown"

    # Dynamic auto-detection of sequence number from trailing tokens:
    # 1. Enclosed sequence: e.g. "SKU (10)", "SKU(1)", "SKU [2]", "SKU_{3}"
    m_enclosed = re.search(r"[\(\[\{]\s*(\d+)\s*[\)\]\}]\s*$", stem)
    if m_enclosed:
        seq = int(m_enclosed.group(1))
        raw_id = stem[:m_enclosed.start()].rstrip("-_ \t")
        bbid = raw_id if raw_id else stem
        return bbid, seq, "unknown"

    # 2. Delimited trailing sequence: e.g. "SKU_10", "SKU-2", "SKU 03"
    m_delimited = re.search(r"[-_\s]+(\d+)\s*$", stem)
    if m_delimited:
        seq = int(m_delimited.group(1))
        raw_id = stem[:m_delimited.start()].rstrip("-_ \t")
        bbid = raw_id if raw_id else stem
        return bbid, seq, "unknown"

    # 3. Numeric SKU + sequence followed by a free-text label: e.g. "8906108896502_4_BATCH CODE"
    #    (the label describes the image; the SKU and sequence come before it)
    m_labelled = re.match(r"^(\d{5,})[-_\s]+(\d{1,3})[-_\s]+\D.*$", stem)
    if m_labelled:
        return m_labelled.group(1), int(m_labelled.group(2)), "unknown"

    # 4. Pure numeric stem: e.g. "1.jpg" or "20004725.png"
    if stem.isdigit():
        val = int(stem)
        if val < 100:
            return stem, val, "unknown"
        return stem, fallback_seq, "unknown"

    # 5. General identifier with no sequence suffix
    return stem, fallback_seq, "unknown"


@router.post("/batch/{batch_id}/images-files")
async def upload_image_files(
    batch_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Directly uploads multiple image files (JPG, PNG, WEBP) without requiring an Excel manifest or ZIP."""
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    b_dir = BigBasketStorage.get_batch_dir(batch)
    orig_dir = b_dir / "original"
    orig_dir.mkdir(parents=True, exist_ok=True)

    registered_count = 0
    existing_count = db.query(BatchImage).filter(BatchImage.batch_id == batch_id).count()

    for file in files:
        if not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue
        content = await file.read()
        dest = orig_dir / Path(file.filename).name
        with open(dest, "wb") as f:
            f.write(content)

        bbid, seq, img_type = parse_filename_bbid_and_seq(
            file.filename,
            fallback_seq=(existing_count + registered_count + 1)
        )

        b_img = BatchImage(
            batch_id=batch.id,
            bbid=bbid,
            original_filename=Path(file.filename).name,
            original_file_path=str(dest),
            image_type=img_type,
            sequence_order=seq,
            file_size_bytes=len(content),
            status="pending",
        )
        db.add(b_img)
        registered_count += 1

    batch.total_images = (batch.total_images or 0) + registered_count
    db.commit()

    return {
        "message": f"Successfully uploaded and registered {registered_count} image(s).",
        "batch_id": batch.id,
        "total_images": batch.total_images,
    }


@router.post("/batch/{batch_id}/images-zip")
async def upload_images_zip(
    batch_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Images must be uploaded as a .zip archive.")

    content = await file.read()
    b_dir = BigBasketStorage.get_batch_dir(batch)
    orig_dir = b_dir / "original"

    # Extract all image files
    extracted_images = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for name in zf.namelist():
            if name.endswith("/") or name.startswith("__MACOSX"):
                continue
            if name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                data = zf.read(name)
                dest = orig_dir / Path(name).name
                with open(dest, "wb") as f:
                    f.write(data)
                extracted_images.append(dest)

    # Register extracted images directly using filename heuristics
    registered_count = 0
    existing_count = db.query(BatchImage).filter(BatchImage.batch_id == batch_id).count()

    for p in extracted_images:
        bbid, seq, img_type = parse_filename_bbid_and_seq(
            p.name,
            fallback_seq=(existing_count + registered_count + 1),
        )

        b_img = BatchImage(
            batch_id=batch.id,
            bbid=bbid,
            original_filename=p.name,
            original_file_path=str(p),
            image_type=img_type,
            sequence_order=seq,
            file_size_bytes=p.stat().st_size,
            status="pending",
        )
        db.add(b_img)
        registered_count += 1

    batch.total_images = (batch.total_images or 0) + registered_count
    db.commit()

    return {
        "message": f"Successfully extracted and registered {registered_count} images for batch.",
        "batch_id": batch.id,
        "total_images": batch.total_images,
    }

