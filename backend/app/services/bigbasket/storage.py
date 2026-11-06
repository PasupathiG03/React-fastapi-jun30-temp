import os
import shutil
from pathlib import Path
from typing import Optional

# Point to backend/uploads and backend/exports
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads" / "bigbasket"
EXPORT_DIR = BACKEND_DIR / "exports" / "bigbasket"


class BigBasketStorage:
    """Manages file storage, intermediate versions, and exports for BigBasket images."""

    @staticmethod
    def ensure_dirs():
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get_batch_dir(cls, batch_code: str) -> Path:
        b_dir = UPLOAD_DIR / "batches" / batch_code
        b_dir.mkdir(parents=True, exist_ok=True)
        (b_dir / "original").mkdir(exist_ok=True)
        (b_dir / "processed").mkdir(exist_ok=True)
        (b_dir / "versions").mkdir(exist_ok=True)
        return b_dir

    @classmethod
    def get_export_dir(cls, batch_code: str) -> Path:
        e_dir = EXPORT_DIR / "batches" / batch_code
        e_dir.mkdir(parents=True, exist_ok=True)
        return e_dir

    @classmethod
    def save_original_file(cls, batch_code: str, filename: str, content: bytes) -> str:
        b_dir = cls.get_batch_dir(batch_code)
        safe_name = Path(filename).name
        target_path = b_dir / "original" / safe_name
        with open(target_path, "wb") as f:
            f.write(content)
        return str(target_path)

    @classmethod
    def save_version_file(cls, batch_code: str, image_id: int, version_type: str, content: bytes, ext: str = "png") -> str:
        b_dir = cls.get_batch_dir(batch_code)
        filename = f"img_{image_id}_{version_type}.{ext}"
        target_path = b_dir / "versions" / filename
        with open(target_path, "wb") as f:
            f.write(content)
        return str(target_path)

    @classmethod
    def save_final_output(cls, batch_code: str, bbid: str, sequence: int, content: bytes) -> str:
        b_dir = cls.get_batch_dir(batch_code)
        # BigBasket standard output naming: {BBID}_{sequence}.png
        filename = f"{bbid}_{sequence}.png"
        target_path = b_dir / "processed" / filename
        with open(target_path, "wb") as f:
            f.write(content)
        return str(target_path)

    @classmethod
    def clean_batch(cls, batch_code: str):
        b_dir = UPLOAD_DIR / "batches" / batch_code
        if b_dir.exists():
            shutil.rmtree(b_dir, ignore_errors=True)
        e_dir = EXPORT_DIR / "batches" / batch_code
        if e_dir.exists():
            shutil.rmtree(e_dir, ignore_errors=True)

