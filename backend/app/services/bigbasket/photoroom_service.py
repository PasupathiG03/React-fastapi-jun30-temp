import logging
import os
import io
import requests
from typing import Optional
from PIL import Image

logger = logging.getLogger(__name__)


class PhotoroomService:
    """
    Photoroom AI API Integration for commercial-grade background removal.
    Official Documentation: https://docs.photoroom.com/

    Endpoints:
    - Background Removal (Segment): POST https://sdk.photoroom.com/v1/segment
    """

    SEGMENT_URL = "https://sdk.photoroom.com/v1/segment"

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
            "Connection": "close",
        }

        data = {
            "format": "png",
            "size": size,
            "crop": "true" if crop else "false",
            "channels": "rgba",
        }

        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(
                    f"[Photoroom] Requesting AI background removal (attempt {attempt}/{max_retries}): "
                    f"size={size}, crop={crop}, payload={len(image_bytes)} bytes..."
                )
                # Recreate files dict for every attempt so the stream buffer is fresh
                files = {
                    "image_file": ("input.png", image_bytes, "image/png"),
                }

                resp = requests.post(
                    cls.SEGMENT_URL,
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=timeout_seconds,
                )

                if resp.status_code == 200:
                    result_bytes = resp.content
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

            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as net_err:
                logger.warning(
                    f"[Photoroom] Network connection hiccup on attempt {attempt}/{max_retries}: {net_err}."
                )
                if attempt < max_retries:
                    backoff = attempt * 1.5
                    logger.info(f"[Photoroom] Retrying in {backoff:.1f}s...")
                    import time
                    time.sleep(backoff)
                    continue
                logger.error("[Photoroom] All connection retries exhausted.")
                return None
            except Exception as e:
                logger.error(f"[Photoroom] Unexpected request error: {e}", exc_info=True)
                return None

        return None

