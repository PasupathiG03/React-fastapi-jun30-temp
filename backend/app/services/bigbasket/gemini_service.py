import base64
import hashlib
import json
import logging
import random
import time
from typing import Any, Dict, List, Literal, Optional
import requests
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.prompts import (
    GEMINI_CLASSIFICATION_SCHEMA,
    PACKAGING_SUBREGIONS_SCHEMA,
    SYSTEM_PROMPT,
    SUBREGION_SYSTEM_PROMPT,
    build_gemini_classification_prompt,
    build_gemini_subregions_prompt,
)

logger = logging.getLogger(__name__)


class MaterialInfo(BaseModel):
    name: str
    confidence: float = Field(default=0.95, ge=0.0, le=1.0)


class DetectedProductItem(BaseModel):
    """Specific individual product detected in a cookware kit / multi-product image."""
    product_type: str
    quantity: int = Field(default=1, ge=1)
    components: List[str] = Field(default_factory=list)
    materials: List[str] = Field(default_factory=list)
    bounding_box: Optional[List[int]] = None  # [ymin, xmin, ymax, xmax] normalized 0-1000


class GeminiProductClassification(BaseModel):
    """
    Validated structured classification schema per Phase 5 specifications,
    supporting multi-object kitchenware identification and dynamic attribute recognition.
    """
    primary_category: Literal["FOOD", "NON_FOOD", "KITCHEN_ITEMS", "UNKNOWN"] = "UNKNOWN"
    subcategory: str = "General"
    product_type: str = "Product"
    is_multi_product_image: bool = False
    total_detected_products: int = 1
    detected_products: List[DetectedProductItem] = Field(default_factory=list)
    materials: List[MaterialInfo] = Field(default_factory=list)
    components: List[str] = Field(default_factory=list)
    visual_properties: List[str] = Field(default_factory=list)
    image_type: Literal[
        "FOP", "BOP", "INGREDIENT", "NUTRITION", "MANUFACTURER",
        "FSSAI", "BARCODE", "LIFESTYLE", "INFOGRAPHIC", "OTHER", "UNKNOWN"
    ] = "FOP"
    classification_confidence: float = Field(default=0.95, ge=0.0, le=1.0)
    requires_manual_review: bool = False
    reasoning: Optional[str] = None


class DetectedPackagingRegion(BaseModel):
    """Specific sub-region detected on retail packaging by Gemini Multimodal Vision AI."""
    region_type: Literal[
        "ingredient", "nutritional", "manufactured_by", "fssai", "barcode",
        "directions", "caution", "storage"
    ]
    display_name: str
    box_2d: List[int] = Field(description="[ymin, xmin, ymax, xmax] normalized 0 to 1000")
    confidence: float = Field(default=0.95, ge=0.0, le=1.0)
    is_standalone_crop: bool = Field(default=False, description="True if this region should be extracted as a standalone asset")
    catalog_sequence: Optional[int] = Field(default=None, description="Dynamic sequence ordering for standalone catalog images")
    text_summary: Optional[str] = None


class GeminiPackagingRegionsResponse(BaseModel):
    detected_regions: List[DetectedPackagingRegion] = Field(default_factory=list)


class GeminiClassificationService:
    """
    Google Gemini AI Multimodal Image Classification Client.
    Uses exactly ONE configured Gemini model (settings.GEMINI_MODEL) with structured JSON output.
    Features image hash-based caching to prevent redundant API calls.
    Prompts and schemas are cleanly maintained in app.prompts.
    """

    _CACHE: Dict[str, GeminiProductClassification] = {}
    _SUBREGIONS_CACHE: Dict[str, List[Dict[str, Any]]] = {}
    _MAX_CACHE_ITEMS = 2000

    # Official Google AI Studio Pricing for gemini-3.5-flash-lite / gemini-2.5-flash
    PRICE_INPUT_PER_MILLION: float = 0.30     # $0.30 per 1M input tokens
    PRICE_OUTPUT_PER_MILLION: float = 2.50    # $2.50 per 1M output/thinking tokens

    @classmethod
    def calculate_cost(cls, prompt_tokens: int, candidates_tokens: int, thoughts_tokens: int = 0) -> float:
        """
        Calculates exact API cost in USD based on official Google AI Studio rates:
        - Input: $0.30 per 1,000,000 tokens ($0.00000030 per token)
        - Output & Thinking: $2.50 per 1,000,000 tokens ($0.00000250 per token)
        """
        cost_input = (prompt_tokens / 1_000_000.0) * cls.PRICE_INPUT_PER_MILLION
        cost_output = ((candidates_tokens + thoughts_tokens) / 1_000_000.0) * cls.PRICE_OUTPUT_PER_MILLION
        return round(cost_input + cost_output, 7)

    @classmethod
    def _log_usage(
        cls,
        status: str,
        status_code: int = 200,
        model_name: str = "",
        prompt_tokens: int = 0,
        candidates_tokens: int = 0,
        thoughts_tokens: int = 0,
        total_tokens: int = 0,
        cached_tokens: int = 0,
        estimated_cost_usd: float = 0.0,
        cost_saved_usd: float = 0.0,
        latency_ms: float = 0.0,
        bbid: str = "",
        filename: str = "",
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
        classification: Optional[GeminiProductClassification] = None,
        error_message: Optional[str] = None,
        metadata_payload: Optional[Dict[str, Any]] = None,
    ):
        """Persists granular API audit record to PostgreSQL gemini_api_logs."""
        try:
            from app.models.role import Role  # noqa: F401
            from app.models.user import User  # noqa: F401
            from app.core.database import SessionLocal
            from app.models.gemini_usage import GeminiApiLog

            db = SessionLocal()
            try:
                meta = dict(metadata_payload or {})
                if classification and classification.is_multi_product_image:
                    meta["is_multi_product_image"] = True
                    meta["total_detected_products"] = classification.total_detected_products
                    meta["detected_products"] = [p.model_dump() for p in classification.detected_products]

                log_entry = GeminiApiLog(
                    model_name=model_name,
                    status=status,
                    status_code=status_code,
                    prompt_tokens=prompt_tokens,
                    candidates_tokens=candidates_tokens,
                    thoughts_tokens=thoughts_tokens,
                    total_tokens=total_tokens,
                    cached_tokens=cached_tokens,
                    estimated_cost_usd=estimated_cost_usd,
                    cost_saved_usd=cost_saved_usd,
                    latency_ms=round(latency_ms, 2),
                    bbid=bbid,
                    filename=filename,
                    batch_id=batch_id,
                    image_id=image_id,
                    primary_category=classification.primary_category if classification else None,
                    subcategory=classification.subcategory if classification else None,
                    product_type=classification.product_type if classification else None,
                    classification_confidence=classification.classification_confidence if classification else None,
                    image_type=classification.image_type if classification else None,
                    requires_manual_review=1 if (classification and classification.requires_manual_review) else 0,
                    materials=[m.model_dump() for m in classification.materials] if classification else None,
                    components=classification.components if classification else None,
                    visual_properties=classification.visual_properties if classification else None,
                    error_message=error_message,
                    metadata_payload=meta if meta else None,
                )
                db.add(log_entry)
                db.commit()
            finally:
                db.close()
        except Exception as log_err:
            logger.warning(f"Could not persist Gemini usage log: {log_err}")

    @classmethod
    def get_image_hash(cls, image_bytes: bytes) -> str:
        return hashlib.sha256(image_bytes).hexdigest()

    @classmethod
    def classify_image(
        cls,
        image_bytes: bytes,
        filename: str = "",
        bbid: str = "",
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
    ) -> GeminiProductClassification:
        """
        Classifies an image using the single configured Google Gemini Vision model.
        Returns a validated GeminiProductClassification Pydantic model.
        Tracks official token consumption (input, output, thoughts) and logs to database.
        """
        img_hash = cls.get_image_hash(image_bytes)
        import os
        model_name = (getattr(settings, "GEMINI_MODEL", "") or os.getenv("GEMINI_MODEL", "")).strip()

        # 1. Strict Environment Configuration Validation
        if not model_name:
            logger.error("GEMINI_MODEL is not configured in .env! Please define GEMINI_MODEL in .env.")
            unknown_res = GeminiProductClassification(
                primary_category="UNKNOWN",
                subcategory="Unconfigured Model",
                product_type="Unconfigured Model",
                classification_confidence=0.0,
                requires_manual_review=True,
                reasoning="GEMINI_MODEL is missing in .env. Model name must be configured strictly via .env environment variable."
            )
            return unknown_res

        # 2. Check local hash cache
        if img_hash in cls._CACHE:
            cached_classification = cls._CACHE[img_hash]
            logger.info(f"Gemini Cache Hit for hash {img_hash[:10]} (BBID: {bbid})")
            # Typical call saves ~300 prompt tokens + 120 output tokens = ~$0.00039 USD
            cost_saved = cls.calculate_cost(prompt_tokens=300, candidates_tokens=120)
            cls._log_usage(
                status="CACHE_HIT",
                status_code=200,
                model_name=model_name,
                prompt_tokens=0,
                candidates_tokens=0,
                thoughts_tokens=0,
                total_tokens=0,
                cached_tokens=300,
                estimated_cost_usd=0.0,
                cost_saved_usd=cost_saved,
                latency_ms=0.5,
                bbid=bbid,
                filename=filename,
                batch_id=batch_id,
                image_id=image_id,
                classification=cached_classification,
                metadata_payload={"cache_key": img_hash[:16], "reason": "SHA-256 duplicate image cache match"}
            )
            return cached_classification

        api_key = getattr(settings, "GEMINI_API_KEY", "") or ""

        # 2. Strict AI requirement: Do not guess using hardcoded fallback patterns.
        # If API Key is missing, route directly to UNKNOWN for manual review.
        if not api_key:
            logger.error("GEMINI_API_KEY is not configured! Cannot classify without Gemini API.")
            unknown_res = GeminiProductClassification(
                primary_category="UNKNOWN",
                subcategory="Unclassified",
                product_type="Unclassified",
                classification_confidence=0.0,
                requires_manual_review=True,
                reasoning="GEMINI_API_KEY is missing. Strict AI policy forbids keyword fallback guessing; routed for manual review."
            )
            cls._log_usage(
                status="ERROR",
                status_code=401,
                model_name=model_name,
                prompt_tokens=0,
                candidates_tokens=0,
                thoughts_tokens=0,
                total_tokens=0,
                estimated_cost_usd=0.0,
                cost_saved_usd=0.0,
                latency_ms=0.0,
                bbid=bbid,
                filename=filename,
                batch_id=batch_id,
                image_id=image_id,
                classification=unknown_res,
                error_message="GEMINI_API_KEY is not configured. Classification requires Gemini Vision AI."
            )
            return unknown_res

        # 3. Call Google Gemini REST API with Structured JSON Output
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

        # Optimize payload for fast, reliable transfer (<1280px)
        send_bytes = image_bytes
        mime_type = "image/png" if image_bytes[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
        if len(image_bytes) > 800_000:
            try:
                import io
                from PIL import Image
                im = Image.open(io.BytesIO(image_bytes))
                if max(im.size) > 1280:
                    im.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                    buf = io.BytesIO()
                    if im.mode in ("RGBA", "P"):
                        im.save(buf, format="PNG")
                        mime_type = "image/png"
                    else:
                        im.save(buf, format="JPEG", quality=88)
                        mime_type = "image/jpeg"
                    send_bytes = buf.getvalue()
            except Exception as opt_err:
                logger.warning(f"Could not downscale image for Gemini: {opt_err}")
                send_bytes = image_bytes

        b64_data = base64.b64encode(send_bytes).decode("utf-8")

        payload = {
            "system_instruction": {
                "parts": [{"text": SYSTEM_PROMPT}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": build_gemini_classification_prompt(filename=filename, bbid=bbid)
                        },
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_data
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "response_schema": GEMINI_CLASSIFICATION_SCHEMA,
                "temperature": 0.1,
            }
        }

        max_attempts = int(getattr(settings, "GEMINI_MAX_ATTEMPTS", 3) or os.getenv("GEMINI_MAX_ATTEMPTS", 3))
        for attempt in range(1, max_attempts + 1):
            try:
                t0 = time.perf_counter()
                resp = requests.post(
                    endpoint,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                    timeout=30.0
                )
                latency = (time.perf_counter() - t0) * 1000

                if resp.status_code == 200:
                    raw_json = resp.json()
                    usage_meta = raw_json.get("usageMetadata", {})
                    prompt_tok = usage_meta.get("promptTokenCount", 280)
                    candidates_tok = usage_meta.get("candidatesTokenCount", 95)
                    thoughts_tok = usage_meta.get("thoughtsTokenCount", 0)
                    total_tok = usage_meta.get("totalTokenCount", prompt_tok + candidates_tok + thoughts_tok)
                    cached_tok = usage_meta.get("cachedContentTokenCount", 0)
                    cost_usd = cls.calculate_cost(prompt_tok, candidates_tok, thoughts_tok)

                    candidates = raw_json.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            text_payload = parts[0]["text"]
                            parsed_dict = json.loads(text_payload)
                            classification = GeminiProductClassification(**parsed_dict)
                            logger.info(
                                f"Gemini [{model_name}] classified {filename} (BBID {bbid}) -> "
                                f"{classification.primary_category} ({classification.subcategory}) in {latency:.1f}ms | "
                                f"Tokens: {total_tok} (In: {prompt_tok}, Out: {candidates_tok}, Thoughts: {thoughts_tok}) | ${cost_usd:.6f}"
                            )
                            cls._cache_classification(img_hash, classification)
                            cls._log_usage(
                                status="SUCCESS",
                                status_code=200,
                                model_name=model_name,
                                prompt_tokens=prompt_tok,
                                candidates_tokens=candidates_tok,
                                thoughts_tokens=thoughts_tok,
                                total_tokens=total_tok,
                                cached_tokens=cached_tok,
                                estimated_cost_usd=cost_usd,
                                cost_saved_usd=0.0,
                                latency_ms=latency,
                                bbid=bbid,
                                filename=filename,
                                batch_id=batch_id,
                                image_id=image_id,
                                classification=classification,
                                metadata_payload={"usage_metadata": usage_meta}
                            )
                            return classification
                    raise ValueError("Empty or malformed Gemini response candidate parts")

                elif resp.status_code in (429, 503) and attempt < max_attempts:
                    backoff = min(10.0, (1.8 ** attempt) + random.uniform(0.5, 1.5))
                    logger.warning(
                        f"Gemini {resp.status_code} temporary capacity spike (attempt {attempt}/{max_attempts}). "
                        f"Google servers under high demand. Retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                    continue

                elif resp.status_code == 429:
                    err_msg = f"Gemini API rate limit exceeded (429): {resp.text[:300]}"
                    logger.error(err_msg)
                    cls._log_usage(
                        status="ERROR",
                        status_code=429,
                        model_name=model_name,
                        latency_ms=latency,
                        bbid=bbid,
                        filename=filename,
                        batch_id=batch_id,
                        image_id=image_id,
                        error_message=err_msg
                    )
                else:
                    err_msg = f"Gemini API error {resp.status_code}: {resp.text[:300]}"
                    logger.error(err_msg)
                    cls._log_usage(
                        status="ERROR",
                        status_code=resp.status_code,
                        model_name=model_name,
                        latency_ms=latency,
                        bbid=bbid,
                        filename=filename,
                        batch_id=batch_id,
                        image_id=image_id,
                        error_message=err_msg
                    )

            except (requests.RequestException, json.JSONDecodeError, ValidationError, ValueError) as err:
                if attempt < max_attempts:
                    backoff = min(10.0, (1.8 ** attempt) + random.uniform(0.5, 1.5))
                    logger.warning(f"Gemini request exception (attempt {attempt}/{max_attempts}): {err}. Retrying in {backoff:.1f}s...")
                    time.sleep(backoff)
                    continue
                err_msg = f"Gemini classification failed: {str(err)[:400]}"
                logger.error(err_msg)
                cls._log_usage(
                    status="ERROR",
                    status_code=500,
                    model_name=model_name,
                    latency_ms=0.0,
                    bbid=bbid,
                    filename=filename,
                    batch_id=batch_id,
                    image_id=image_id,
                    error_message=err_msg
                )

        # 4. Strict AI Policy: If Gemini API fails, NEVER guess with keyword heuristics.
        # Mark as UNKNOWN and route for manual review.
        unknown_classification = GeminiProductClassification(
            primary_category="UNKNOWN",
            subcategory="Unclassified",
            product_type="Unclassified",
            classification_confidence=0.0,
            requires_manual_review=True,
            reasoning="Gemini AI API call was unsuccessful. Manual review is required."
        )
        return unknown_classification

    @classmethod
    def _cache_classification(cls, img_hash: str, res: GeminiProductClassification):
        if len(cls._CACHE) >= cls._MAX_CACHE_ITEMS:
            cls._CACHE.clear()
        cls._CACHE[img_hash] = res


    @classmethod
    def detect_packaging_sub_regions(
        cls,
        image_bytes: bytes,
        bbid: str = "",
        filename: str = "",
        category: str = "FOOD",
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Uses Gemini Multimodal Vision AI to semantically locate the exact normalized bounding boxes [ymin, xmin, ymax, xmax]
        for standard retail packaging sub-regions (Ingredients, Nutritional Table, Manufacturer/Marketer, FSSAI, Barcode).
        Never relies on brittle OCR string matches or hardcoded heuristics.
        Returns a list of dicts: [{"region_type": ..., "display_name": ..., "box_2d": [...], "confidence": ..., "text_summary": ...}].
        """
        img_hash = cls.get_image_hash(image_bytes)
        if img_hash in cls._SUBREGIONS_CACHE:
            logger.info(f"Gemini Sub-Regions Cache Hit for hash {img_hash[:10]} (BBID: {bbid})")
            return cls._SUBREGIONS_CACHE[img_hash]

        import os
        model_name = (getattr(settings, "GEMINI_MODEL", "") or os.getenv("GEMINI_MODEL", "")).strip()
        api_key = getattr(settings, "GEMINI_API_KEY", "") or ""

        if not model_name or not api_key:
            logger.warning("Gemini model or API key not configured; skipping AI sub-region localization.")
            return []

        # Prepare optimized downscaled payload (<1280px) for fast and reliable inference
        send_bytes = image_bytes
        mime_type = "image/png" if image_bytes[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
        try:
            import io
            from PIL import Image
            im = Image.open(io.BytesIO(image_bytes))
            if max(im.size) > 1280:
                im.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                im.convert("RGB").save(buf, format="JPEG", quality=90)
                send_bytes = buf.getvalue()
                mime_type = "image/jpeg"
        except Exception as opt_err:
            logger.warning(f"Could not downscale image for Gemini sub-regions: {opt_err}")

        b64_data = base64.b64encode(send_bytes).decode("utf-8")

        user_prompt = build_gemini_subregions_prompt(
            bbid=bbid,
            filename=filename,
            category=category,
        )

        payload = {
            "system_instruction": {
                "parts": [{"text": SUBREGION_SYSTEM_PROMPT}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": user_prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_data
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "response_schema": PACKAGING_SUBREGIONS_SCHEMA,
                "temperature": 0.1,
            }
        }

        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

        max_attempts = int(getattr(settings, "GEMINI_MAX_ATTEMPTS", 3) or os.getenv("GEMINI_MAX_ATTEMPTS", 3))
        for attempt in range(1, max_attempts + 1):
            try:
                t0 = time.perf_counter()
                resp = requests.post(
                    endpoint,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                    timeout=35.0
                )
                latency = (time.perf_counter() - t0) * 1000

                if resp.status_code == 200:
                    raw_json = resp.json()
                    usage_meta = raw_json.get("usageMetadata", {})
                    prompt_tok = usage_meta.get("promptTokenCount", 300)
                    candidates_tok = usage_meta.get("candidatesTokenCount", 120)
                    thoughts_tok = usage_meta.get("thoughtsTokenCount", 0)
                    total_tok = usage_meta.get("totalTokenCount", prompt_tok + candidates_tok + thoughts_tok)
                    cost_usd = cls.calculate_cost(prompt_tok, candidates_tok, thoughts_tok)

                    candidates = raw_json.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            parsed = json.loads(parts[0]["text"])
                            regions = parsed.get("detected_regions", [])
                            logger.info(
                                f"Gemini AI localized {len(regions)} packaging sub-regions for {filename} (BBID {bbid}) in {latency:.1f}ms | "
                                f"Tokens: {total_tok} | Cost: ${cost_usd:.6f}"
                            )
                            # Cache in memory
                            if len(cls._SUBREGIONS_CACHE) >= cls._MAX_CACHE_ITEMS:
                                cls._SUBREGIONS_CACHE.clear()
                            cls._SUBREGIONS_CACHE[img_hash] = regions

                            cls._log_usage(
                                status="SUCCESS",
                                status_code=200,
                                model_name=model_name,
                                prompt_tokens=prompt_tok,
                                candidates_tokens=candidates_tok,
                                thoughts_tokens=thoughts_tok,
                                total_tokens=total_tok,
                                estimated_cost_usd=cost_usd,
                                latency_ms=latency,
                                bbid=bbid,
                                filename=filename,
                                batch_id=batch_id,
                                image_id=image_id,
                                metadata_payload={"action": "packaging_sub_regions", "region_count": len(regions)}
                            )
                            return regions
                elif resp.status_code in (429, 503) and attempt < max_attempts:
                    backoff = min(10.0, (1.8 ** attempt) + random.uniform(0.5, 1.5))
                    logger.warning(
                        f"Gemini {resp.status_code} temporary capacity spike (attempt {attempt}/{max_attempts}). "
                        f"Google servers under high demand. Retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                    continue
                else:
                    logger.warning(f"Gemini sub-regions API responded with status {resp.status_code}: {resp.text[:200]}")
            except Exception as e:
                if attempt < max_attempts:
                    backoff = min(10.0, (1.8 ** attempt) + random.uniform(0.5, 1.5))
                    time.sleep(backoff)
                    continue
                logger.warning(f"Gemini packaging sub-region detection error: {e}")

        return []
