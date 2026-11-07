import logging
import os
import io
import requests
from typing import Optional, Dict, Any, Tuple
from PIL import Image

logger = logging.getLogger(__name__)


class PhotoroomService:
    """
    Photoroom AI API Integration for commercial-grade background removal.
    Official Documentation: https://docs.photoroom.com/

    Endpoints:
    - Background Removal (Segment): POST https://sdk.photoroom.com/v1/segment
    - Account Credits & Status:     GET  https://image-api.photoroom.com/v2/account
    """

    SEGMENT_URL = "https://sdk.photoroom.com/v1/segment"
    ACCOUNT_URL = "https://image-api.photoroom.com/v2/account"

    @classmethod
    def get_api_key(cls) -> str:
        """Retrieves the Photoroom API key from settings or environment."""
        try:
            from app.core.config import settings
            key = getattr(settings, "PHOTOROOM_API_KEY", "") or os.getenv("PHOTOROOM_API_KEY", "")
        except Exception:
            key = os.getenv("PHOTOROOM_API_KEY", "")
        return (key or "").strip()

    @classmethod
    def is_configured(cls) -> bool:
        """Returns True if a non-empty Photoroom API key is set."""
        return bool(cls.get_api_key())

    @classmethod
    def check_account_status(cls, api_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Queries Photoroom account API to verify API key validity and remaining quota.
        Does not consume any image credits.
        """
        key = (api_key or cls.get_api_key()).strip()
        if not key:
            return {
                "configured": False,
                "valid": False,
                "message": "PHOTOROOM_API_KEY is not set in backend/.env",
            }

        headers = {
            "x-api-key": key,
            "Accept": "application/json",
        }

        try:
            resp = requests.get(cls.ACCOUNT_URL, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "configured": True,
                    "valid": True,
                    "status_code": 200,
                    "data": data,
                    "message": "Photoroom API key is active and valid.",
                }
            elif resp.status_code in (401, 403):
                return {
                    "configured": True,
                    "valid": False,
                    "status_code": resp.status_code,
                    "message": "Invalid Photoroom API key or unauthorized access.",
                }
            elif resp.status_code == 402:
                return {
                    "configured": True,
                    "valid": False,
                    "status_code": 402,
                    "message": "Photoroom account has insufficient credits / payment required.",
                }
            else:
                return {
                    "configured": True,
                    "valid": False,
                    "status_code": resp.status_code,
                    "message": f"Photoroom returned HTTP {resp.status_code}: {resp.text[:200]}",
                }
        except Exception as e:
            logger.warning(f"[Photoroom] Account check failed: {e}")
            return {
                "configured": True,
                "valid": False,
                "message": f"Network or connection error while contacting Photoroom: {str(e)}",
            }

    @classmethod
    def remove_background(
        cls,
        image_bytes: bytes,
        crop: bool = False,
        size: str = "full",
        timeout_seconds: int = 40,
    ) -> Optional[bytes]:
        """
        Submits the image to Photoroom AI Segmentation endpoint.
        Returns RGBA transparent PNG bytes if successful, or None on failure/missing key.

        Parameters:
        - image_bytes: Raw binary bytes of input image (JPEG, PNG, WEBP, etc.)
        - crop: If False, preserves the subject's original geometry and position on full frame.
                If True, crops tightly to the foreground bounding box.
        - size: "full" (max quality/resolution up to 4096px), "medium", or "preview".
        """
        api_key = cls.get_api_key()
        if not api_key:
            logger.debug("[Photoroom] PHOTOROOM_API_KEY is not configured; skipping cloud segmentation.")
            return None

        headers = {
            "x-api-key": api_key,
            "Accept": "image/png, application/json",
        }

        # Multipart form data according to official Python documentation
        files = {
            "image_file": ("input.png", image_bytes, "image/png"),
        }
        data = {
            "format": "png",
            "size": size,
            "crop": "true" if crop else "false",
            "channels": "rgba",
        }

        try:
            logger.info(
                f"[Photoroom] Requesting AI background removal: size={size}, crop={crop}, payload={len(image_bytes)} bytes..."
            )
            resp = requests.post(
                cls.SEGMENT_URL,
                headers=headers,
                files=files,
                data=data,
                timeout=timeout_seconds,
            )

            if resp.status_code == 200:
                result_bytes = resp.content
                # Verify that the returned payload is indeed a valid image with transparency
                try:
                    with Image.open(io.BytesIO(result_bytes)) as test_img:
                        if test_img.mode != "RGBA":
                            test_img = test_img.convert("RGBA")
                            buf = io.BytesIO()
                            test_img.save(buf, format="PNG")
                            result_bytes = buf.getvalue()
                    logger.info(
                        f"[Photoroom] Background removed successfully! Received {len(result_bytes)} bytes RGBA PNG."
                    )
                    return result_bytes
                except Exception as img_err:
                    logger.error(f"[Photoroom] Returned content is not a readable image: {img_err}")
                    return None
            else:
                logger.error(
                    f"[Photoroom] Segmentation failed with HTTP {resp.status_code}: {resp.text[:300]}"
                )
                return None

        except requests.exceptions.Timeout:
            logger.warning("[Photoroom] Request timed out. Gracefully falling back to local segmentation.")
            return None
        except Exception as e:
            logger.error(f"[Photoroom] Request error: {e}", exc_info=True)
            return None

