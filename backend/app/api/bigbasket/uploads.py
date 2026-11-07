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
    stem = Path(filename).stem.strip()

    # 1. BBID (SEQ) pattern: e.g. "20004725 (10)" or "20004725(1)"
    m = re.match(r"^([A-Za-z0-9_-]+?)\s*\((.+?)\)$", stem)
    if m:
        raw_id, raw_seq = m.group(1).strip(), m.group(2).strip()
        if raw_seq.isdigit():
            seq = int(raw_seq)
            return raw_id, seq, "fop" if seq == 1 else "bop"
        if any(f in raw_seq.lower() for f in ["front", "fop"]):
            return raw_id, 1, "fop"
        if any(b in raw_seq.lower() for b in ["back", "bop", "rear"]):
            return raw_id, 2, "bop"

    # 2. BBID[-_ ](front|back|fop|bop|rear)
    m = re.match(r"^([A-Za-z0-9_-]+?)[-_ ]+(front|fop|back|bop|rear)$", stem, re.IGNORECASE)
    if m:
        raw_id, tag = m.group(1).strip(), m.group(2).lower()
        if tag in ("front", "fop"):
            return raw_id, 1, "fop"
        return raw_id, 2, "bop"

    # 3. BBID[-_ ](\d+) e.g. "20004725_10" or "20004725-2" or "20004725 10"
    m = re.match(r"^([A-Za-z0-9_-]+?)[-_ ]+(\d+)$", stem)
    if m:
        raw_id, raw_seq = m.group(1).strip(), int(m.group(2))
        return raw_id, raw_seq, "fop" if raw_seq == 1 else "bop"

    # 4. Fallback split on whitespace, dash, or underscore
    parts = re.split(r"[-_ ]+", stem)
    bbid = parts[0].strip() if parts and parts[0].strip() else stem
    seq = fallback_seq
    if len(parts) > 1 and parts[1].strip().isdigit():
        seq = int(parts[1].strip())
    return bbid, seq, "fop" if seq == 1 else "bop"


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

