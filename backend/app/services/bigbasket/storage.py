import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Optional, Union

# Root directories for uploads and exports directly under backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"
EXPORT_DIR = BACKEND_DIR / "exports"


class BigBasketStorage:
    """
    Manages file storage and exports organized by date (dd-mm-yyyy)
    and batch name with ID: <uploads/exports>/<dd-mm-yyyy>/<batch_name>_<batch_id>/
    """

    @staticmethod
    def ensure_dirs():
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def sanitize_name(name: str) -> str:
        if not name:
            return "batch"
        # Keep alphanumeric, underscores, hyphens
        clean = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(name).strip()).strip("_")
        return clean or "batch"

    @classmethod
    def resolve_batch_info(
        cls,
        batch_or_code: Any,
        batch_name: Optional[str] = None,
        created_at: Optional[datetime] = None,
    ) -> tuple[str, str, str]:
        """
        Returns (date_str, folder_name, batch_code)
        date_str: dd-mm-yyyy (e.g. 07-11-2026)
        folder_name: <batch_name>_<batch_id> (e.g. test_IS-BATCH-016)
        """
        if hasattr(batch_or_code, "batch_code"):
            code = getattr(batch_or_code, "batch_code", "")
            name = getattr(batch_or_code, "name", "") or "batch"
            dt = getattr(batch_or_code, "created_at", None) or datetime.now()
        else:
            code = str(batch_or_code)
            name = batch_name or "batch"
            dt = created_at or datetime.now()

        date_str = dt.strftime("%d-%m-%Y")
        clean_name = cls.sanitize_name(name)
        folder_name = clean_name if clean_name.endswith(code) else f"{clean_name}_{code}"
        return date_str, folder_name, code

    @classmethod
    def _find_existing_dir(cls, root: Path, batch_code: str) -> Optional[Path]:
        """Finds existing batch folder matching *_{batch_code} or {batch_code} under root."""
        if not root.exists():
            return None
        # 1. Search date subfolders: root / dd-mm-yyyy / ...
        for d in root.iterdir():
            if d.is_dir():
                # Direct check if d matches
                if d.name.endswith(f"_{batch_code}") or d.name == batch_code:
                    return d
                for sub in d.iterdir():
                    if sub.is_dir() and (sub.name.endswith(f"_{batch_code}") or sub.name == batch_code):
                        return sub
        # 2. Fallback check legacy paths: root / bigbasket / batches / ...
        legacy_dir = root / "bigbasket" / "batches" / batch_code
        if legacy_dir.exists():
            return legacy_dir
        return None

    @classmethod
    def get_batch_dir(
        cls,
        batch_or_code: Any,
        batch_name: Optional[str] = None,
        created_at: Optional[datetime] = None,
    ) -> Path:
        """Returns batch storage directory under uploads/<dd-mm-yyyy>/<batch_name>_<batch_id>/"""
        code = getattr(batch_or_code, "batch_code", str(batch_or_code))
        existing = cls._find_existing_dir(UPLOAD_DIR, code)
        if existing:
            (existing / "original").mkdir(exist_ok=True)
            (existing / "cache").mkdir(exist_ok=True)
            (existing / "processed").mkdir(exist_ok=True)
            return existing

        date_str, folder_name, _ = cls.resolve_batch_info(batch_or_code, batch_name, created_at)
        b_dir = UPLOAD_DIR / date_str / folder_name
        b_dir.mkdir(parents=True, exist_ok=True)
        (b_dir / "original").mkdir(exist_ok=True)
        (b_dir / "cache").mkdir(exist_ok=True)
        (b_dir / "processed").mkdir(exist_ok=True)
        return b_dir

    @classmethod
    def get_export_dir(
        cls,
        batch_or_code: Any,
        batch_name: Optional[str] = None,
        created_at: Optional[datetime] = None,
    ) -> Path:
        """Returns batch export directory under exports/<dd-mm-yyyy>/<batch_name>_<batch_id>/"""
        code = getattr(batch_or_code, "batch_code", str(batch_or_code))
        existing = cls._find_existing_dir(EXPORT_DIR, code)
        if existing:
            return existing

        date_str, folder_name, _ = cls.resolve_batch_info(batch_or_code, batch_name, created_at)
        e_dir = EXPORT_DIR / date_str / folder_name
        e_dir.mkdir(parents=True, exist_ok=True)
        return e_dir

    @classmethod
    def save_original_file(cls, batch_or_code: Any, filename: str, content: bytes) -> str:
        b_dir = cls.get_batch_dir(batch_or_code)
        safe_name = Path(filename).name
        target_path = b_dir / "original" / safe_name
        with open(target_path, "wb") as f:
            f.write(content)
        return str(target_path)

    @classmethod
    def save_version_file(
        cls,
        batch_or_code: Any,
        image_id: int,
        version_type: str,
        content: bytes,
        ext: str = "png",
    ) -> str:
        b_dir = cls.get_batch_dir(batch_or_code)
        filename = f"img_{image_id}_{version_type}.{ext}"
        # Save segmented and intermediate versions in dedicated cache/ folder to keep processed/ clean
        target_path = b_dir / "cache" / filename
        with open(target_path, "wb") as f:
            f.write(content)
        return str(target_path)

    @classmethod
    def save_final_output(cls, batch_or_code: Any, bbid: str, sequence: int, content: bytes) -> str:
        b_dir = cls.get_batch_dir(batch_or_code)
        # BigBasket standard output naming: {BBID}_{sequence}.png
        filename = f"{bbid}_{sequence}.png"
        target_path = b_dir / "processed" / filename
        with open(target_path, "wb") as f:
            f.write(content)
        return str(target_path)

    @classmethod
    def clean_batch(cls, batch_or_code: Any):
        code = getattr(batch_or_code, "batch_code", str(batch_or_code))
        u_dir = cls._find_existing_dir(UPLOAD_DIR, code)
        if u_dir and u_dir.exists():
            shutil.rmtree(u_dir, ignore_errors=True)
        e_dir = cls._find_existing_dir(EXPORT_DIR, code)
        if e_dir and e_dir.exists():
            shutil.rmtree(e_dir, ignore_errors=True)


