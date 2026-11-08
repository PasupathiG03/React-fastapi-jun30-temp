import abc
import time
from typing import Any, Dict, Optional

from app.services.bigbasket.gemini_service import GeminiClassificationService
from app.services.bigbasket.rules_engine import DynamicRulesEngine


class BaseAiProvider(abc.ABC):
    @abc.abstractmethod
    async def classify_and_analyze(
        self,
        image_bytes: bytes,
        filename: str,
        bbid: str = "",
    ) -> Dict[str, Any]:
        """Returns dict with predicted_category, confidence_score, and metadata."""
        pass


class GeminiAiProvider(BaseAiProvider):
    """
    Unified Google Gemini Vision AI Provider.
    Classifies BigBasket catalog images into FOOD, NON_FOOD, or KITCHEN_ITEMS,
    extracts materials, components, and resolves category-specific rules.
    """

    async def classify_and_analyze(
        self,
        image_bytes: bytes,
        filename: str,
        bbid: str = "",
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()

        classification = GeminiClassificationService.classify_image(
            image_bytes=image_bytes,
            filename=filename,
            bbid=bbid,
            batch_id=batch_id,
            image_id=image_id,
        )

        rules = DynamicRulesEngine.resolve_rules(classification)
        latency = (time.perf_counter() - t0) * 1000

        # Map to application image_type
        eff_img_type = classification.image_type.lower()
        if eff_img_type in ("fop", "front"):
            category = "fop"
        elif eff_img_type in ("bop", "back"):
            category = "bop"
        elif "nutri" in eff_img_type:
            category = "nutritional"
        elif "ingred" in eff_img_type:
            category = "ingredient"
        elif "mfg" in eff_img_type or "manufact" in eff_img_type:
            category = "manufactured_by"
        elif "fssai" in eff_img_type:
            category = "fssai"
        elif "barcode" in eff_img_type:
            category = "barcode"
        elif "lifestyle" in eff_img_type:
            category = "lifestyle"
        elif "infographic" in eff_img_type:
            category = "infographic"
        else:
            category = eff_img_type

        return {
            "provider": "gemini",
            "predicted_category": category,
            "primary_category": classification.primary_category,
            "product_category": classification.primary_category,
            "subcategory": classification.subcategory,
            "product_type": classification.product_type,
            "is_multi_product_image": classification.is_multi_product_image,
            "total_detected_products": classification.total_detected_products,
            "detected_products": [p.model_dump() for p in classification.detected_products],
            "materials": [m.model_dump() for m in classification.materials],
            "components": classification.components,
            "visual_properties": classification.visual_properties,
            "confidence_score": classification.classification_confidence,
            "requires_manual_review": classification.requires_manual_review,
            "matched_rules": rules.active_rules,
            "rules_config": rules.model_dump(),
            "reasoning": classification.reasoning,
            "latency_ms": round(latency, 2),
            "raw_response": classification.model_dump(),
        }


class LocalCpuAiProvider(GeminiAiProvider):
    """Backward compatibility alias for GeminiAiProvider."""
    pass


class HybridAiManager:
    """Coordinates Gemini multimodal image classification and rule resolution."""

    def __init__(self):
        self.provider = GeminiAiProvider()

    async def analyze_image(
        self,
        image_bytes: bytes,
        filename: str,
        bbid: str = "",
        threshold: float = 0.95,
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        return await self.provider.classify_and_analyze(
            image_bytes,
            filename,
            bbid=bbid,
            batch_id=batch_id,
            image_id=image_id,
        )


