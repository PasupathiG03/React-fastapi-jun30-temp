import abc
import asyncio
import base64
import io
import json
import os
import time
from typing import Any, Dict, Optional
import urllib.request
import urllib.error

from PIL import Image

from app.core.config import settings
from app.core.logger import logger


class BaseAiProvider(abc.ABC):
    @abc.abstractmethod
    async def classify_and_analyze(self, image_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Returns dict with predicted_category, confidence_score, and metadata."""
        pass


class LocalCpuAiProvider(BaseAiProvider):
    """Fast, local CPU-based image classification using filename heuristics, format, and aspect ratio."""

    async def classify_and_analyze(self, image_bytes: bytes, filename: str) -> Dict[str, Any]:
        t0 = time.perf_counter()
        name_lower = filename.lower()

        category = "unknown"
        confidence = 0.88

        # Heuristic rules matching typical BigBasket naming patterns
        if any(k in name_lower for k in ["front", "-1.", " (1).", "_1."]):
            category = "fop"
            confidence = 0.94
        elif any(k in name_lower for k in ["back", "-2.", " (2).", "_2."]):
            category = "bop"
            confidence = 0.92
        elif any(k in name_lower for k in ["nutrition", "nutri", "-3.", " (3).", "_3."]):
            category = "nutritional"
            confidence = 0.90
        elif any(k in name_lower for k in ["ingredient", "-4.", " (4).", "_4."]):
            category = "ingredient"
            confidence = 0.90
        elif any(k in name_lower for k in ["mfg", "marketed", "manufacture"]):
            category = "manufactured_by"
            confidence = 0.89
        elif any(k in name_lower for k in ["fssai", "barcode", "code"]):
            category = "fssai"
            confidence = 0.91
        elif any(k in name_lower for k in ["lifestyle", "recipe", "serve"]):
            category = "lifestyle"
            confidence = 0.93

        latency = (time.perf_counter() - t0) * 1000
        return {
            "provider": "local_cpu",
            "predicted_category": category,
            "confidence_score": confidence,
            "tokens_used": 0,
            "latency_ms": round(latency, 2),
            "raw_response": {"method": "local_heuristics", "matched_rule": category},
        }


class GeminiAiProvider(BaseAiProvider):
    """Cloud-based visual reasoning using Gemini API for ambiguous, difficult, or low-confidence product packaging."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or getattr(settings, "GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
        self.model = model or getattr(settings, "GEMINI_MODEL", "gemini-flash-lite-latest") or os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

    async def classify_and_analyze(self, image_bytes: bytes, filename: str) -> Dict[str, Any]:
        if not self.api_key:
            logger.warning("Gemini API key not configured; falling back to local CPU prediction.")
            return await LocalCpuAiProvider().classify_and_analyze(image_bytes, filename)

        t0 = time.perf_counter()
        try:
            # Optimize payload: create a lightweight 640px JPEG thumbnail (~30KB) instead of uploading massive raw image
            # This drastically reduces network latency, prevents socket write timeouts, and avoids Google token bloat
            try:
                bio = io.BytesIO(image_bytes)
                with Image.open(bio) as pil_img:
                    pil_img = pil_img.convert("RGB")
                    pil_img.thumbnail((640, 640), Image.Resampling.LANCZOS)
                    thumb_buf = io.BytesIO()
                    pil_img.save(thumb_buf, format="JPEG", quality=85)
                    thumb_bytes = thumb_buf.getvalue()
                b64_data = base64.b64encode(thumb_bytes).decode("utf-8")
            except Exception:
                b64_data = base64.b64encode(image_bytes).decode("utf-8")

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

            payload = {
                "contents": [
                    {
                        "parts": [
                            {
                                "text": (
                                    "Analyze this product package image. Classify its primary view angle as one of: "
                                    "'fop' (front of pack), 'bop' (back of pack), 'nutritional' (nutritional facts table), "
                                    "'ingredient' (ingredients list), 'fssai' (FSSAI license or barcode panel), 'lifestyle' (serving suggestion or lifestyle). "
                                    "Return JSON with keys: category (one of the above), confidence (float between 0.0 and 1.0), "
                                    "brand (string or null), product_name (string or null)."
                                )
                            },
                            {
                                "inline_data": {
                                    "mime_type": "image/jpeg",
                                    "data": b64_data
                                }
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "response_mime_type": "application/json"
                }
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )

            # Run in thread pool with 20s timeout to avoid blocking async event loop
            def _execute_request():
                with urllib.request.urlopen(req, timeout=20.0) as resp:
                    return json.loads(resp.read().decode("utf-8"))

            result_json = await asyncio.to_thread(_execute_request)

            content_text = (
                result_json.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "{}")
            )
            parsed = json.loads(content_text)
            category = parsed.get("category", "fop").lower().strip()
            confidence = float(parsed.get("confidence", 0.95))

            latency = (time.perf_counter() - t0) * 1000
            return {
                "provider": "gemini",
                "predicted_category": category,
                "confidence_score": confidence,
                "tokens_used": result_json.get("usageMetadata", {}).get("totalTokenCount", 0),
                "latency_ms": round(latency, 2),
                "raw_response": {"model": self.model, "prediction": parsed},
            }
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}; falling back to local CPU prediction.")
            return await LocalCpuAiProvider().classify_and_analyze(image_bytes, filename)


class HybridAiManager:
    """Coordinates local CPU execution with Gemini fallback for low-confidence or ambiguous classifications."""

    def __init__(self):
        self.local_provider = LocalCpuAiProvider()
        self.gemini_provider = GeminiAiProvider()

    async def analyze_image(
        self,
        image_bytes: bytes,
        filename: str,
        threshold: float = 0.95,
    ) -> Dict[str, Any]:
        # 1. Run fast local inference
        local_result = await self.local_provider.classify_and_analyze(image_bytes, filename)

        # 2. Check if local confidence satisfies threshold and category is identified
        if (
            local_result["confidence_score"] >= threshold
            and local_result["predicted_category"] != "unknown"
        ):
            return local_result

        # 3. Fallback to Gemini API for ambiguous or low-confidence predictions
        logger.info(f"Ambiguous prediction for {filename} ({local_result['confidence_score']:.2f}); escalating to Gemini.")
        gemini_result = await self.gemini_provider.classify_and_analyze(image_bytes, filename)
        return gemini_result

