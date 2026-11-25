import io
import re
import zipfile
from pathlib import Path
from typing import BinaryIO, List, Union
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image
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


def is_image(source: Union[bytes, BinaryIO]) -> bool:
    """True when the content is an image this server can read. The content decides, not the file extension,
    so any format the image library supports is accepted (PNG, JPEG, WEBP, AVIF, BMP, TIFF, GIF, ...)."""
    try:
        with Image.open(io.BytesIO(source) if isinstance(source, bytes) else source) as im:
            im.verify()
        return True
    except Exception:
        return False


def zip_image_entries(zf: zipfile.ZipFile) -> List[str]:
    """Image entries of a ZIP, in archive order: every file whose content is an image, skipping folders,
    macOS metadata and hidden files."""
    names = []
    for name in zf.namelist():
        if name.endswith("/") or name.startswith("__MACOSX") or "/__MACOSX/" in name:
            continue
        if Path(name).name.startswith("."):
            continue
        with zf.open(name) as fh:
            if is_image(fh):
                names.append(name)
    return names


def zip_folder_as_bbid(names: List[str]) -> bool:
    """True when images are grouped one folder per product (e.g. 3534535345/1.png, 4025437635/1.jpg),
    so the folder name is the BBID. A single wrapper folder around flat files keeps filename parsing."""
    parents = {str(Path(n).parent) for n in names}
    parents.discard(".")
    return len(parents) > 1


def resolve_bbid_and_seq(entry_name: str, use_folder: bool, next_seq_for) -> tuple:
    """BBID and sequence for one uploaded image. In a per-product folder the folder is the BBID and the
    filename gives the sequence; otherwise the filename gives both."""
    path = Path(entry_name)
    folder = path.parent.name
    stem = path.stem.strip()
    if folder and (use_folder or (stem.isdigit() and int(stem) < 100)):
        _, seq, img_type = parse_filename_bbid_and_seq(path.name, fallback_seq=next_seq_for(folder))
        return folder, seq, img_type
    stem_bbid, _, _ = parse_filename_bbid_and_seq(path.name)
    return parse_filename_bbid_and_seq(path.name, fallback_seq=next_seq_for(stem_bbid))


class SequenceAllocator:
    """Keeps (bbid, sequence) unique within a batch, which the database enforces
    (uq_batch_images_bbid_sequence). A clash moves the image to the BBID's next free sequence."""

    def __init__(self, db: Session, batch_id: int):
        self.used = set(
            db.query(BatchImage.bbid, BatchImage.sequence_order).filter(BatchImage.batch_id == batch_id).all()
        )

    def next_free(self, bbid: str) -> int:
        seq = 1
        while (bbid, seq) in self.used:
            seq += 1
        return seq

    def claim(self, bbid: str, seq: int) -> int:
        if (bbid, seq) in self.used:
            seq = self.next_free(bbid)
        self.used.add((bbid, seq))
        return seq


def unique_dest(directory: Path, filename: str, taken: set) -> Path:
    """A path in `directory` that no other file of this batch uses, so same-named files never overwrite."""
    stem, suffix = Path(filename).stem, Path(filename).suffix
    candidate, n = filename, 1
    while candidate.lower() in taken or (directory / candidate).exists():
        candidate = f"{stem}_{n}{suffix}"
        n += 1
    taken.add(candidate.lower())
    return directory / candidate


@router.post("/batch/{batch_id}/images-files")
async def upload_image_files(
    batch_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Directly uploads multiple image files (any readable image format) without an Excel manifest or ZIP."""
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    b_dir = BigBasketStorage.get_batch_dir(batch)
    orig_dir = b_dir / "original"
    orig_dir.mkdir(parents=True, exist_ok=True)

    registered_count = 0
    allocator = SequenceAllocator(db, batch.id)
    taken_names: set = set()

    skipped: List[str] = []

    for file in files:
        content = await file.read()
        if not is_image(content):
            skipped.append(Path(file.filename or "").name)
            continue
        dest = unique_dest(orig_dir, Path(file.filename).name, taken_names)
        with open(dest, "wb") as f:
            f.write(content)

        bbid, seq, img_type = resolve_bbid_and_seq(file.filename, False, allocator.next_free)
        seq = allocator.claim(bbid, seq)

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

    if registered_count == 0:
        raise HTTPException(status_code=400, detail="None of the uploaded files could be read as an image.")

    batch.total_images = (batch.total_images or 0) + registered_count
    db.commit()

    return {
        "message": f"Successfully uploaded and registered {registered_count} image(s).",
        "batch_id": batch.id,
        "total_images": batch.total_images,
        "skipped_files": skipped,
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

    orig_dir.mkdir(parents=True, exist_ok=True)
    allocator = SequenceAllocator(db, batch.id)
    taken_names: set = set()
    registered_count = 0

    # Extract all image files. A ZIP may hold one folder per product (folder name = BBID), so files with the
    # same name in different folders are common: each gets its own BBID and its own file on disk.
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Corrupted or invalid ZIP file.")
    with zf:
        names = zip_image_entries(zf)
        use_folder = zip_folder_as_bbid(names)
        for name in names:
            bbid, seq, img_type = resolve_bbid_and_seq(name, use_folder, allocator.next_free)
            seq = allocator.claim(bbid, seq)

            entry = Path(name)
            disk_name = f"{entry.parent.name}_{entry.name}" if entry.parent.name else entry.name
            p = unique_dest(orig_dir, disk_name, taken_names)
            with open(p, "wb") as f:
                f.write(zf.read(name))

            b_img = BatchImage(
                batch_id=batch.id,
                bbid=bbid,
                original_filename=entry.name,
                original_file_path=str(p),
                image_type=img_type,
                sequence_order=seq,
                file_size_bytes=p.stat().st_size,
                status="pending",
            )
            db.add(b_img)
            registered_count += 1

    if registered_count == 0:
        raise HTTPException(status_code=400, detail="No readable images were found in the ZIP.")

    batch.total_images = (batch.total_images or 0) + registered_count
    db.commit()

    return {
        "message": f"Successfully extracted and registered {registered_count} images for batch.",
        "batch_id": batch.id,
        "total_images": batch.total_images,
    }
