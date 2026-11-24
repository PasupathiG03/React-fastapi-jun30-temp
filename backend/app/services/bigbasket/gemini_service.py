import base64
import hashlib
import json
import logging
from pathlib import Path
import random
import time
from typing import Any, Dict, List, Literal, Optional, Union
import requests
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.prompts import (
    GEMINI_CLASSIFICATION_SCHEMA,
    PACKAGING_SUBREGIONS_SCHEMA,
    MRP_EXPIRY_STAMPS_SCHEMA,
    SYSTEM_PROMPT,
    SUBREGION_SYSTEM_PROMPT,
    MRP_EXPIRY_SYSTEM_PROMPT,
    build_gemini_classification_prompt,
    build_gemini_subregions_prompt,
    build_gemini_mrp_expiry_prompt,
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


class GeminiClassificationService:
    """
    Google Gemini AI Multimodal Image Classification Client.
    Uses the configured primary model (settings.GEMINI_MODEL) with structured JSON output and,
    when that model stays overloaded (429/5xx) after all retries, the optional
    settings.GEMINI_FALLBACK_MODEL. Every usage log records the model that actually answered.
    Features image hash-based caching to prevent redundant API calls.
    Prompts and schemas are cleanly maintained in app.prompts.
    """

    _CACHE: Dict[str, GeminiProductClassification] = {}
    _SUBREGIONS_CACHE: Dict[str, List[Dict[str, Any]]] = {}
    _MRP_EXPIRY_CACHE: Dict[str, Dict[str, Any]] = {}
    _MAX_CACHE_ITEMS = 2000

    # Default Google AI Studio paid-tier rates (USD per 1M tokens), used for any model not in MODEL_PRICING.
    PRICE_INPUT_PER_MILLION: float = 0.30     # $0.30 per 1M input tokens
    PRICE_OUTPUT_PER_MILLION: float = 2.50    # $2.50 per 1M output/thinking tokens

    # Per-model rates, USD per 1M tokens: (input, output incl. thinking, cached input or None).
    # Matched by longest model-name prefix, so "gemini-2.5-flash-lite-xx" uses the flash-lite rate, not flash.
    # Source: https://aistudio.google.com/docs/pricing (Standard paid tier, checked 2026-11-24).
    # Cached input = implicit context-cache hits (usageMetadata.cachedContentTokenCount); None = cache rate
    # not on file, so cached tokens are billed at the full input rate (never under-reports cost).
    # Note: 3.8/3.6 Flash rise to $1.50/$7.50 on 2027-01-01; Gemini 4 Carbon/Argon rise to $4/$20 on 2026-12-01.
    MODEL_PRICING: Dict[str, tuple] = {
        "gemini-4-carbon": (2.00, 10.00, None),
        "gemini-4-argon": (2.00, 10.00, None),
        "gemini-4-neon": (3.00, 15.00, None),
        "gemini-4-hydrogen": (1.50, 7.50, 0.075),
        "gemini-3.8-flash": (0.75, 3.75, 0.075),
        "gemini-3.6-flash": (0.75, 3.75, None),
        "gemini-3.5-flash-lite": (0.30, 2.50, 0.03),
        "gemini-3.1-flash-lite": (0.25, 1.50, 0.025),
        "gemini-3-flash-preview": (0.50, 3.00, None),
        "gemini-3.1-pro-preview": (2.00, 12.00, None),   # prompts <= 200k tokens
        "gemini-2.5-flash": (0.30, 2.50, None),          # deprecated: routed to gemini-3.5-flash-lite from 2026-12-01
        "gemini-2.5-flash-lite": (0.10, 0.40, 0.01),
        "gemini-2.5-pro": (1.25, 10.00, None),           # deprecated: routed to gemini-3.8-flash from 2026-12-01
    }

    # HTTP statuses where another attempt (or another model) can succeed.
    _RETRYABLE_STATUS = (429, 500, 502, 503, 504)

    @classmethod
    def get_pricing(cls, model_name: str = "") -> Dict[str, Any]:
        """Returns {"input", "output", "cached"} in $/1M tokens plus "known" (rate on file) for a model name."""
        name = (model_name or "").strip().lower()
        best = ""
        for prefix in cls.MODEL_PRICING:
            if name.startswith(prefix) and len(prefix) > len(best):
                best = prefix
        if best:
            rate_in, rate_out, rate_cached = cls.MODEL_PRICING[best]
            return {
                "input": rate_in, "output": rate_out,
                "cached": rate_cached if rate_cached is not None else rate_in, "known": True,
            }
        return {
            "input": cls.PRICE_INPUT_PER_MILLION, "output": cls.PRICE_OUTPUT_PER_MILLION,
            "cached": cls.PRICE_INPUT_PER_MILLION, "known": False,
        }

    @classmethod
    def calculate_cost(
        cls,
        prompt_tokens: int,
        candidates_tokens: int,
        thoughts_tokens: int = 0,
        model_name: str = "",
        cached_tokens: int = 0,
    ) -> float:
        """
        API cost in USD at the rates of the model that answered:
        - prompt tokens (text + image) at the input rate, except the cached part of the prompt
          (promptTokenCount includes cachedContentTokenCount) which is billed at the cache rate;
        - output and thinking tokens at the output rate ("Output price (including thinking tokens)").
        """
        rates = cls.get_pricing(model_name)
        cached = max(0, min(int(cached_tokens or 0), int(prompt_tokens or 0)))
        cost_input = ((prompt_tokens - cached) / 1_000_000.0) * rates["input"]
        cost_cached = (cached / 1_000_000.0) * rates["cached"]
        cost_output = ((candidates_tokens + thoughts_tokens) / 1_000_000.0) * rates["output"]
        return round(cost_input + cost_cached + cost_output, 7)

    @classmethod
    def get_model_chain(cls) -> List[str]:
        """Primary model first, then the fallback model (if configured and different)."""
        import os
        primary = (getattr(settings, "GEMINI_MODEL", "") or os.getenv("GEMINI_MODEL", "")).strip()
        fallback = (getattr(settings, "GEMINI_FALLBACK_MODEL", "") or os.getenv("GEMINI_FALLBACK_MODEL", "")).strip()
        chain = [m for m in (primary, fallback) if m]
        return list(dict.fromkeys(chain))

    @classmethod
    def _call_gemini(cls, payload: Dict[str, Any], timeout: Any, parse, purpose: str) -> Dict[str, Any]:
        """
        POSTs the payload to each model in the chain. Each model gets GEMINI_MAX_ATTEMPTS tries;
        only overload/transient failures (429, 5xx, timeouts, unparseable output) move on to the
        fallback model. Bad-request/auth errors (400/401/403) stop immediately since another model
        would fail the same way.

        `parse(raw_json)` turns a 200 response into the caller's value and raises on malformed output.

        Returns a dict with: ok, model, value, usage, latency, status_code, error, used_fallback, primary_model.
        """
        models = cls.get_model_chain()
        api_key = getattr(settings, "GEMINI_API_KEY", "") or ""
        max_attempts = max(1, settings.GEMINI_MAX_ATTEMPTS)
        primary = models[0] if models else ""
        result: Dict[str, Any] = {
            "ok": False, "model": primary, "value": None, "usage": {}, "latency": 0.0,
            "status_code": 500, "error": "No Gemini model configured", "used_fallback": False,
            "primary_model": primary,
        }

        for idx, model_name in enumerate(models):
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            result.update({"model": model_name, "used_fallback": idx > 0})
            model_payload = payload
            gen_cfg = payload.get("generationConfig", {})
            if "thinkingLevel" in gen_cfg.get("thinkingConfig", {}) and model_name.lower().startswith(("gemini-2", "gemini-1")):
                # thinkingLevel is a Gemini 3+ setting; 2.x models reject it with 400, so drop it for them.
                model_payload = {**payload, "generationConfig": {k: v for k, v in gen_cfg.items() if k != "thinkingConfig"}}
            for attempt in range(1, max_attempts + 1):
                latency = 0.0
                try:
                    t0 = time.perf_counter()
                    resp = requests.post(
                        endpoint,
                        headers={"Content-Type": "application/json"},
                        json=model_payload,
                        timeout=timeout,
                    )
                    latency = (time.perf_counter() - t0) * 1000

                    if resp.status_code == 200:
                        raw_json = resp.json()
                        value = parse(raw_json)
                        result.update({
                            "ok": True, "value": value, "latency": latency, "status_code": 200,
                            "usage": raw_json.get("usageMetadata", {}) or {}, "error": None,
                        })
                        return result

                    result.update({
                        "latency": latency, "status_code": resp.status_code,
                        "error": f"Gemini API error {resp.status_code}: {resp.text[:300]}",
                    })
                    if resp.status_code not in cls._RETRYABLE_STATUS and resp.status_code != 404:
                        # Request/auth problem: same outcome on any model, so stop here.
                        logger.error(f"Gemini [{model_name}] {purpose}: {result['error']}")
                        return result
                    if resp.status_code == 404:
                        break  # model name not found: no point retrying it, try the fallback
                except (requests.RequestException, json.JSONDecodeError, ValidationError, ValueError, KeyError, TypeError) as err:
                    result.update({
                        "latency": latency, "status_code": 500,
                        "error": f"Gemini {purpose} failed: {str(err)[:400]}",
                    })

                if attempt < max_attempts:
                    backoff = min(10.0, (1.8 ** attempt) + random.uniform(0.5, 1.5))
                    logger.warning(
                        f"Gemini [{model_name}] {purpose}: {result['status_code']} "
                        f"(attempt {attempt}/{max_attempts}). Retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)

            if idx + 1 < len(models):
                logger.warning(
                    f"Gemini [{model_name}] {purpose} still failing ({result['status_code']}) after "
                    f"{max_attempts} attempt(s); switching to fallback model {models[idx + 1]}."
                )

        logger.error(f"Gemini [{result['model']}] {purpose}: {result['error']}")
        return result

    @staticmethod
    def _first_text_part(raw_json: Dict[str, Any]) -> str:
        candidates = raw_json.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts and "text" in parts[0]:
                return parts[0]["text"]
        raise ValueError("Empty or malformed Gemini response candidate parts")

    @staticmethod
    def _call_metadata(call: Dict[str, Any], extra: Dict[str, Any]) -> Dict[str, Any]:
        """Usage-log metadata noting which model answered and whether the fallback was used."""
        meta = dict(extra)
        meta["primary_model"] = call.get("primary_model")
        meta["used_fallback_model"] = bool(call.get("used_fallback"))
        return meta

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
        user_id: Optional[int] = None,
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
            from app.models.bigbasket import ImageBatch, BatchImage

            db = SessionLocal()
            try:
                # If user_id is not passed, resolve automatically from batch or image
                effective_user_id = user_id
                effective_batch_id = batch_id
                effective_image_id = image_id

                if effective_batch_id:
                    batch_exists = db.query(ImageBatch.id, ImageBatch.created_by_id).filter(ImageBatch.id == effective_batch_id).first()
                    if batch_exists:
                        if not effective_user_id and batch_exists[1]:
                            effective_user_id = batch_exists[1]
                    else:
                        effective_batch_id = None

                if effective_image_id:
                    img_exists = db.query(BatchImage.id, BatchImage.created_by_id, BatchImage.batch_id).filter(BatchImage.id == effective_image_id).first()
                    if img_exists:
                        if not effective_user_id and img_exists[1]:
                            effective_user_id = img_exists[1]
                        if not effective_batch_id and img_exists[2]:
                            b_rec = db.query(ImageBatch.id, ImageBatch.created_by_id).filter(ImageBatch.id == img_exists[2]).first()
                            if b_rec:
                                effective_batch_id = b_rec[0]
                                if not effective_user_id and b_rec[1]:
                                    effective_user_id = b_rec[1]
                    else:
                        effective_image_id = None

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
                    batch_id=effective_batch_id,
                    image_id=effective_image_id,
                    user_id=effective_user_id,
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
            except Exception as commit_err:
                db.rollback()
                logger.warning(f"Could not persist Gemini usage log: {commit_err}")
            finally:
                db.close()
        except Exception as log_err:
            logger.warning(f"Could not process Gemini usage log: {log_err}")

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
            cost_saved = cls.calculate_cost(prompt_tokens=300, candidates_tokens=120, model_name=model_name)
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

        thinking_level = (getattr(settings, "GEMINI_THINKING_LEVEL", "") or "").strip().lower()
        if thinking_level:
            payload["generationConfig"]["thinkingConfig"] = {"thinkingLevel": thinking_level}

        def _parse_classification(raw_json: Dict[str, Any]) -> GeminiProductClassification:
            return GeminiProductClassification(**json.loads(cls._first_text_part(raw_json)))

        call = cls._call_gemini(payload, timeout=30.0, parse=_parse_classification, purpose="classification")
        used_model = call["model"]
        if call["ok"]:
            classification = call["value"]
            usage_meta = call["usage"]
            latency = call["latency"]
            prompt_tok = usage_meta.get("promptTokenCount", 280)
            candidates_tok = usage_meta.get("candidatesTokenCount", 95)
            thoughts_tok = usage_meta.get("thoughtsTokenCount", 0)
            total_tok = usage_meta.get("totalTokenCount", prompt_tok + candidates_tok + thoughts_tok)
            cached_tok = usage_meta.get("cachedContentTokenCount", 0)
            cost_usd = cls.calculate_cost(
                prompt_tok, candidates_tok, thoughts_tok, model_name=used_model, cached_tokens=cached_tok
            )
            fallback_note = " (fallback)" if call["used_fallback"] else ""
            logger.info(
                f"Gemini [{used_model}]{fallback_note} classified {filename} (BBID {bbid}) -> "
                f"{classification.primary_category} ({classification.subcategory}) in {latency:.1f}ms | "
                f"Tokens: {total_tok} (In: {prompt_tok}, Out: {candidates_tok}, Thoughts: {thoughts_tok}) | ${cost_usd:.6f}"
            )
            cls._cache_classification(img_hash, classification)
            cls._log_usage(
                status="FALLBACK" if call["used_fallback"] else "SUCCESS",
                status_code=200,
                model_name=used_model,
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
                metadata_payload=cls._call_metadata(call, {"usage_metadata": usage_meta}),
            )
            return classification

        cls._log_usage(
            status="ERROR",
            status_code=call["status_code"],
            model_name=used_model,
            latency_ms=call["latency"],
            bbid=bbid,
            filename=filename,
            batch_id=batch_id,
            image_id=image_id,
            error_message=call["error"],
            metadata_payload=cls._call_metadata(call, {"action": "classification"}),
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

        # Preserve 100% original image quality without any downscaling or lossy compression
        send_bytes = image_bytes
        mime_type = "image/png" if image_bytes[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"

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

        def _parse_regions(raw_json: Dict[str, Any]) -> List[Dict[str, Any]]:
            return json.loads(cls._first_text_part(raw_json)).get("detected_regions", [])

        call = cls._call_gemini(payload, timeout=(30.0, 90.0), parse=_parse_regions, purpose="sub-region detection")
        used_model = call["model"]
        if call["ok"]:
            regions = call["value"]
            usage_meta = call["usage"]
            latency = call["latency"]
            prompt_tok = usage_meta.get("promptTokenCount", 300)
            candidates_tok = usage_meta.get("candidatesTokenCount", 120)
            thoughts_tok = usage_meta.get("thoughtsTokenCount", 0)
            total_tok = usage_meta.get("totalTokenCount", prompt_tok + candidates_tok + thoughts_tok)
            cached_tok = usage_meta.get("cachedContentTokenCount", 0)
            cost_usd = cls.calculate_cost(
                prompt_tok, candidates_tok, thoughts_tok, model_name=used_model, cached_tokens=cached_tok
            )
            logger.info(
                f"Gemini [{used_model}] localized {len(regions)} packaging sub-regions for {filename} (BBID {bbid}) in {latency:.1f}ms | "
                f"Tokens: {total_tok} | Cost: ${cost_usd:.6f}"
            )
            if len(cls._SUBREGIONS_CACHE) >= cls._MAX_CACHE_ITEMS:
                cls._SUBREGIONS_CACHE.clear()
            cls._SUBREGIONS_CACHE[img_hash] = regions

            cls._log_usage(
                status="FALLBACK" if call["used_fallback"] else "SUCCESS",
                status_code=200,
                model_name=used_model,
                prompt_tokens=prompt_tok,
                candidates_tokens=candidates_tok,
                thoughts_tokens=thoughts_tok,
                total_tokens=total_tok,
                cached_tokens=cached_tok,
                estimated_cost_usd=cost_usd,
                latency_ms=latency,
                bbid=bbid,
                filename=filename,
                batch_id=batch_id,
                image_id=image_id,
                metadata_payload=cls._call_metadata(call, {"action": "packaging_sub_regions", "region_count": len(regions)}),
            )
            return regions

        return []

    @classmethod
    def detect_mrp_expiry_stamps(
        cls,
        image_bytes: Union[bytes, str, Path],
        bbid: str = "",
        filename: str = "",
        category: str = "FOOD",
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Uses Gemini Multimodal Vision AI to semantically locate all variable price and expiration markings
        (MRP, Unit Sale Price, Expiry Date, Mfg Date, Batch Code) per BigBasket SRS Section 5.
        Returns a dict: {"has_removable_stamps": bool, "stamps": [{"stamp_type": ..., "box_2d": [...], ...}]}.
        """
        if isinstance(image_bytes, (str, Path)):
            if not filename:
                filename = Path(image_bytes).name
            image_bytes = Path(image_bytes).read_bytes()

        img_hash = cls.get_image_hash(image_bytes)
        if img_hash in cls._MRP_EXPIRY_CACHE:
            logger.info(f"Gemini MRP/Expiry Stamps Cache Hit for hash {img_hash[:10]} (BBID: {bbid})")
            return cls._MRP_EXPIRY_CACHE[img_hash]

        import os
        model_name = (getattr(settings, "GEMINI_MODEL", "") or os.getenv("GEMINI_MODEL", "")).strip()
        api_key = getattr(settings, "GEMINI_API_KEY", "") or ""

        if not model_name or not api_key:
            logger.warning("Gemini model or API key not configured; skipping AI stamp detection.")
            return {"has_removable_stamps": False, "stamps": [], "detection_ok": False}

        # Preserve 100% original image quality without any downscaling or lossy compression
        send_bytes = image_bytes
        mime_type = "image/png" if image_bytes[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
        b64_data = base64.b64encode(send_bytes).decode("utf-8")
        user_prompt = build_gemini_mrp_expiry_prompt(
            bbid=bbid,
            filename=filename,
            category=category,
        )

        payload = {
            "system_instruction": {
                "parts": [{"text": MRP_EXPIRY_SYSTEM_PROMPT}]
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
                "response_schema": MRP_EXPIRY_STAMPS_SCHEMA,
                "temperature": 0.1,
            }
        }

        def _parse_stamps(raw_json: Dict[str, Any]) -> Dict[str, Any]:
            return json.loads(cls._first_text_part(raw_json))

        call = cls._call_gemini(payload, timeout=(30.0, 90.0), parse=_parse_stamps, purpose="stamp detection")
        used_model = call["model"]
        if call["ok"]:
            parsed = call["value"]
            usage_meta = call["usage"]
            latency = call["latency"]
            prompt_tok = usage_meta.get("promptTokenCount", 300)
            candidates_tok = usage_meta.get("candidatesTokenCount", 120)
            thoughts_tok = usage_meta.get("thoughtsTokenCount", 0)
            total_tok = usage_meta.get("totalTokenCount", prompt_tok + candidates_tok + thoughts_tok)
            cached_tok = usage_meta.get("cachedContentTokenCount", 0)
            cost_usd = cls.calculate_cost(
                prompt_tok, candidates_tok, thoughts_tok, model_name=used_model, cached_tokens=cached_tok
            )
            stamps_list = parsed.get("stamps", [])
            has_stamps = parsed.get("has_removable_stamps", bool(stamps_list))
            logger.info(
                f"Gemini [{used_model}] localized {len(stamps_list)} price/date stamp(s) for {filename} (BBID {bbid}) in {latency:.1f}ms | "
                f"Tokens: {total_tok} | Cost: ${cost_usd:.6f}"
            )
            result = {"has_removable_stamps": has_stamps, "stamps": stamps_list, "detection_ok": True}

            if len(cls._MRP_EXPIRY_CACHE) >= cls._MAX_CACHE_ITEMS:
                cls._MRP_EXPIRY_CACHE.clear()
            cls._MRP_EXPIRY_CACHE[img_hash] = result

            cls._log_usage(
                status="FALLBACK" if call["used_fallback"] else "SUCCESS",
                status_code=200,
                model_name=used_model,
                prompt_tokens=prompt_tok,
                candidates_tokens=candidates_tok,
                thoughts_tokens=thoughts_tok,
                total_tokens=total_tok,
                cached_tokens=cached_tok,
                estimated_cost_usd=cost_usd,
                latency_ms=latency,
                bbid=bbid,
                filename=filename,
                batch_id=batch_id,
                image_id=image_id,
                metadata_payload=cls._call_metadata(call, {"action": "mrp_expiry_stamps", "stamp_count": len(stamps_list)}),
            )
            return result

        return {"has_removable_stamps": False, "stamps": [], "detection_ok": False}
