import io
import re
import logging
from typing import Any, Dict, List, Optional
import numpy as np
from PIL import Image

from app.services.bigbasket.sub_region_extractor import read_text, OcrError

logger = logging.getLogger(__name__)

# Regex pattern to match "100%", "100 %", "100 percent"
HUNDRED_PERCENT_REGEX = re.compile(r'(?i)\b100\s*(?:%|percent)\b|100%', re.IGNORECASE)

DEFAULT_MIN_WIDTH = 1500
DEFAULT_MIN_HEIGHT = 1500


def inspect_image_bytes(
    image_bytes: bytes,
    filename: str = "image.png",
    min_width: int = DEFAULT_MIN_WIDTH,
    min_height: int = DEFAULT_MIN_HEIGHT,
) -> Dict[str, Any]:
    """
    Inspects an uploaded image:
    1. Checks if width >= min_width (default 1500) and height >= min_height (default 1500).
    2. Runs RapidOCR to detect any occurrence of '100%' claims on the product package.
    """
    result: Dict[str, Any] = {
        "filename": filename,
        "width": 0,
        "height": 0,
        "format": None,
        "file_size_bytes": len(image_bytes),
        "megapixels": 0.0,
        "required_width": min_width,
        "required_height": min_height,
        "width_shortfall": 0,
        "height_shortfall": 0,
        "is_dimension_valid": False,
        "dimension_message": "",
        "has_hundred_percent": False,
        "hundred_percent_matches": [],
        "ocr_status": "skipped",
        "error": None,
    }

    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
        width, height = pil_img.size
        result["width"] = width
        result["height"] = height
        result["format"] = pil_img.format
        result["megapixels"] = round(width * height / 1_000_000, 2)
        result["width_shortfall"] = max(0, min_width - width)
        result["height_shortfall"] = max(0, min_height - height)

        is_valid = (width >= min_width) and (height >= min_height)
        result["is_dimension_valid"] = is_valid
        if is_valid:
            result["dimension_message"] = "Valid resolution"
        else:
            result["dimension_message"] = (
                f"Below required threshold: {width}×{height}px (required: {min_width}×{min_height}px)"
            )

        # Run RapidOCR for 100% detection
        rgb_img = pil_img.convert("RGB")
        img_arr = np.array(rgb_img)

        try:
            ocr_boxes = read_text(img_arr)
            result["ocr_status"] = "success"

            matches: List[Dict[str, Any]] = []
            for item in ocr_boxes:
                # item format: [[[x, y], [x, y], [x, y], [x, y]], text, confidence]
                if len(item) >= 3:
                    box, text, conf = item[0], str(item[1]), float(item[2])
                    if HUNDRED_PERCENT_REGEX.search(text):
                        matches.append({
                            "text": text,
                            "confidence": round(conf, 4),
                            "box": box,
                        })

            result["has_hundred_percent"] = len(matches) > 0
            result["hundred_percent_matches"] = matches

        except OcrError as ocr_err:
            logger.warning(f"OCR inspection unavailable for {filename}: {ocr_err}")
            result["ocr_status"] = f"unavailable: {ocr_err}"
        except Exception as ocr_exc:
            logger.warning(f"OCR check failed for {filename}: {ocr_exc}")
            result["ocr_status"] = f"failed: {ocr_exc}"

    except Exception as exc:
        logger.error(f"Failed to inspect image {filename}: {exc}")
        result["error"] = str(exc)
        result["dimension_message"] = f"Invalid or unreadable image file: {exc}"

    return result

