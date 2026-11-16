"""Guards Gemini image classification against single-call randomness before background removal.

Gemini is not fully deterministic, even at low temperature: an image near the boundary between two image types
can get a different answer on a later call. Only an FOP/BOP answer leads to background removal, so a single wrong
FOP/BOP answer silently cuts out an image that should have kept its background.

ConsensusAiManager is a drop-in replacement for HybridAiManager:
  * Any answer other than FOP/BOP is returned as-is (no background removal follows, so no extra cost).
  * An FOP/BOP answer is confirmed with one fresh, uncached Gemini call. If the second call disagrees or fails,
    the image is flagged for manual review, so the pipeline skips background removal instead of guessing.
  * fresh=True (used by the Rerun actions) drops the cached answer first, so Rerun really asks Gemini again
    instead of returning the same cached result until the server restarts.

Nothing here depends on a specific product, package, or image: it only reacts to Gemini disagreeing with itself.
"""
from typing import Any, Dict, Optional

from app.core.logger import logger
from app.services.bigbasket.ai_provider import HybridAiManager
from app.services.bigbasket.gemini_service import GeminiClassificationService

# Image types the pipeline removes the background for (see the FOP/BOP whitelist in pipeline.process_image).
_BG_REMOVAL_TYPES = frozenset({"fop", "bop"})


def _image_type(prediction: Dict[str, Any]) -> str:
    return (prediction.get("predicted_category") or "").lower().strip()


def _call_failed(prediction: Dict[str, Any]) -> bool:
    """Gemini errors come back as an UNKNOWN classification with zero confidence (never cached)."""
    return prediction.get("primary_category") in ("UNKNOWN", None) and not prediction.get("confidence_score")


def _drop_cached(image_bytes: bytes) -> None:
    GeminiClassificationService._CACHE.pop(GeminiClassificationService.get_image_hash(image_bytes), None)


class ConsensusAiManager(HybridAiManager):
    """HybridAiManager that double-checks FOP/BOP answers and can bypass the classification cache."""

    def __init__(self, fresh: bool = False):
        super().__init__()
        self.fresh = fresh

    def analyze_image_sync(
        self,
        image_bytes: bytes,
        filename: str,
        bbid: str = "",
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        if self.fresh:
            _drop_cached(image_bytes)

        first = super().analyze_image_sync(image_bytes, filename, bbid=bbid, batch_id=batch_id, image_id=image_id)
        first_type = _image_type(first)
        if first_type not in _BG_REMOVAL_TYPES or first.get("requires_manual_review"):
            return first

        # Confirm with an independent call: the first answer is now cached, so drop it to force a real request.
        _drop_cached(image_bytes)
        second = super().analyze_image_sync(image_bytes, filename, bbid=bbid, batch_id=batch_id, image_id=image_id)
        second_type = _image_type(second)

        if second_type == first_type:
            confirmed = dict(first)
            confirmed["confidence_score"] = min(
                first.get("confidence_score") or 0.0, second.get("confidence_score") or 0.0
            )
            return confirmed

        # Disagreement (or a failed confirmation call): never cache it, so a later Rerun asks Gemini again.
        _drop_cached(image_bytes)
        if _call_failed(second):
            note = (
                f"Gemini answered {first_type.upper()} but the confirmation call failed; "
                "background removal skipped, manual review required."
            )
        else:
            note = (
                f"Gemini gave inconsistent image types for the same image ({first_type.upper()} then "
                f"{(second_type or 'unknown').upper()}); background removal skipped, manual review required."
            )
        logger.warning(f"[ClassificationGuard] image_id={image_id} bbid={bbid}: {note}")

        flagged = dict(first)
        flagged["requires_manual_review"] = True
        flagged["reasoning"] = f"{note} First answer: {first.get('reasoning') or ''}".strip()
        return flagged
