"""Force background removal: reprocess one image without running Gemini image classification.

Runs the exact same pipeline as the Rerun Local/Cloud AI buttons (background removal, standardization, padding,
inpainting, QC validation, BOP sub-region extraction, batch counters, SSE) — only the classification call is
replaced. Checking "Force background removal" is the decision that this is a product pack shot, so background removal is
never skipped for being "unclassified" or "uncertain". Triggered by the "Force background removal" checkbox.
"""
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.logger import logger
from app.models.bigbasket import BatchImage, ImageBatch
from app.services.bigbasket.batch_processor import BatchProcessor
from app.services.bigbasket.events import BigBasketEventBroadcaster

_BOP_TYPES = ("bop", "back", "back of pack")
_UNKNOWN = (None, "", "UNKNOWN")


class _SkipClassificationAi:
    """Stand-in for HybridAiManager: returns a fixed prediction instead of calling Gemini."""

    def __init__(self, prediction: Dict[str, Any]):
        self._prediction = prediction

    def analyze_image_sync(self, *args, **kwargs) -> Dict[str, Any]:
        return dict(self._prediction)


def _build_prediction(img: BatchImage, batch: ImageBatch) -> Dict[str, Any]:
    """Keeps whatever the last classification found, but forces a confident FOP/BOP product-shot result."""
    prior: Dict[str, Any] = (img.validation_results or {}).get("gemini_classification") or {}

    # Keep BOP so back-of-pack sub-region extraction still runs; anything else is treated as a front pack shot.
    current_type = (img.image_type or "").lower().strip()
    image_type = "bop" if current_type in _BOP_TYPES else "fop"

    # Product category: last known classification -> batch setting -> the default the batch processor already uses.
    batch_cat: Optional[str] = (batch.config or {}).get("product_category")
    category = prior.get("primary_category")
    if category in _UNKNOWN:
        category = batch_cat if batch_cat not in (*_UNKNOWN, "auto") else None
    if category in _UNKNOWN:
        category = getattr(img, "category", "") or "FOOD"

    return {
        **prior,
        "predicted_category": image_type,
        "primary_category": category,
        "confidence_score": 1.0,
        "requires_manual_review": False,
        "reasoning": "Image classification skipped (Force background removal).",
    }


class BgOnlyProcessor:
    """Single-image reprocess that skips image classification and does everything else."""

    @staticmethod
    async def run(db: Session, image_id: int, provider: str = "birefnet") -> BatchImage:
        img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
        if not img:
            raise ValueError(f"Image {image_id} not found")

        batch = db.query(ImageBatch).filter(ImageBatch.id == img.batch_id).first()
        if not batch:
            raise ValueError(f"Batch {img.batch_id} not found")

        ai_stub = _SkipClassificationAi(_build_prediction(img, batch))
        cfg = {**(batch.config or {}), "bg_removal_provider": provider}

        img.status = "processing"
        img.error_message = None
        db.commit()

        try:
            await BatchProcessor._process_single_image(db, img, batch, ai_stub, cfg)

            BatchProcessor._refresh_batch_counters(db, batch, include_total=True)
            db.commit()

            await BigBasketEventBroadcaster.publish_event({
                "type": "image_progress",
                "batch_id": batch.id,
                "image_id": img.id,
                "status": img.status,
                "processed_count": batch.processed_images,
                "total_count": batch.total_images,
                "progress_pct": int((batch.processed_images / max(1, batch.total_images)) * 100),
            })

            return img
        except Exception as e:
            logger.exception(f"Failed BgOnlyProcessor.run for image {image_id}: {e}")
            db.rollback()
            img.status = "failed"
            img.error_message = str(e)
            BatchProcessor._refresh_batch_counters(db, batch, include_total=True)
            db.commit()
            raise e
