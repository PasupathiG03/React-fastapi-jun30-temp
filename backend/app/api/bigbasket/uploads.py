import io
import re
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.bigbasket import BatchFileMapping, BatchImage, BatchSource, ImageBatch
from app.models.user import User
from app.schemas.bigbasket import ExcelPreviewResponse
from app.services.bigbasket.manifest import ManifestParser
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


@router.get("/template")
def download_manifest_template(
    current_user: User = Depends(get_current_user),
):
    """Generates and downloads the official Catalog Manifest Excel template (.xlsx)."""
    content = ManifestParser.generate_template()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="Catalog_Manifest_Template.xlsx"',
        },
    )


@router.post("/manifest-preview", response_model=ExcelPreviewResponse)
async def preview_manifest(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Parses uploaded Excel or CSV file and suggests automatic column mappings."""
    if not file.filename.lower().endswith((".xlsx", ".xlsm", ".csv")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Manifest must be an Excel (.xlsx) or CSV (.csv) file.",
        )

    content = await file.read()
    try:
        preview = ManifestParser.get_preview(content, file.filename)
        return preview
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse manifest: {str(e)}")


@router.post("/batch/{batch_id}/manifest")
async def upload_batch_manifest(
    batch_id: int,
    file: UploadFile = File(...),
    bbid_col: str = Form(...),
    filename_col: str = Form(...),
    category_col: Optional[str] = Form(None),
    sequence_col: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    content = await file.read()
    col_map = {
        "bbid": bbid_col,
        "filename": filename_col,
        "category": category_col or "",
        "sequence": sequence_col or "",
    }

    # Save manifest file
    b_dir = BigBasketStorage.get_batch_dir(batch.batch_code)
    manifest_path = b_dir / f"manifest_{file.filename}"
    with open(manifest_path, "wb") as f:
        f.write(content)

    source = BatchSource(
        batch_id=batch.id,
        source_type="manifest_excel",
        excel_filename=file.filename,
        excel_file_path=str(manifest_path),
    )
    db.add(source)

    mapping = BatchFileMapping(
        batch_id=batch.id,
        excel_column_map=col_map,
        validation_status="mapped",
    )
    db.add(mapping)
    db.commit()

    return {
        "message": "Manifest and column mapping attached successfully.",
        "batch_id": batch.id,
        "filename": file.filename,
    }


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

    b_dir = BigBasketStorage.get_batch_dir(batch.batch_code)
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
    b_dir = BigBasketStorage.get_batch_dir(batch.batch_code)
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

    # Check if a manifest mapping exists to register BBID rows
    mapping_record = db.query(BatchFileMapping).filter(BatchFileMapping.batch_id == batch_id).first()
    source_record = db.query(BatchSource).filter(BatchSource.batch_id == batch_id).first()

    matched_count = 0
    used_images = set()

    if mapping_record and source_record and source_record.excel_file_path:
        # Load and parse manifest
        with open(source_record.excel_file_path, "rb") as mf:
            m_content = mf.read()
        records = ManifestParser.parse_records(m_content, source_record.excel_filename, mapping_record.excel_column_map)

        # Build multiple resilient lookup tables for extracted images
        exact_map = {p.name.lower().strip(): p for p in extracted_images}
        stem_map = {p.stem.lower().strip(): p for p in extracted_images}
        norm_map = {re.sub(r"[^a-z0-9]", "", p.stem.lower()): p for p in extracted_images}

        for rec in records:
            raw_target = str(rec.get("original_filename") or "").strip()
            if not raw_target:
                continue

            target_exact = raw_target.lower()
            target_stem = Path(raw_target).stem.lower().strip()
            target_norm = re.sub(r"[^a-z0-9]", "", target_stem)

            # 1. Exact filename match
            matched_p = exact_map.get(target_exact)
            # 2. Stem match (handles .png vs .jpg extension mismatch)
            if not matched_p:
                matched_p = stem_map.get(target_stem)
            # 3. Normalized match (handles formatting differences)
            if not matched_p:
                matched_p = norm_map.get(target_norm)

            if matched_p and matched_p not in used_images:
                b_img = BatchImage(
                    batch_id=batch.id,
                    bbid=rec["bbid"],
                    original_filename=matched_p.name,
                    original_file_path=str(matched_p),
                    image_type=rec.get("image_type", "fop") or "fop",
                    sequence_order=rec.get("sequence_order", 1),
                    file_size_bytes=matched_p.stat().st_size,
                    status="pending",
                )
                db.add(b_img)
                used_images.add(matched_p)
                matched_count += 1

    # For any images not matched by manifest (or if no manifest was provided), register them directly
    for p in extracted_images:
        if p in used_images:
            continue
        bbid, seq, img_type = parse_filename_bbid_and_seq(p.name, fallback_seq=1)

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
        matched_count += 1

    batch.total_images = matched_count
    db.commit()

    return {
        "message": f"Successfully extracted and registered {matched_count} images for batch.",
        "batch_id": batch.id,
        "total_images": matched_count,
    }

