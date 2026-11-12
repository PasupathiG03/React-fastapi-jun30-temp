import io
import math
import logging
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import cv2
from PIL import Image, ImageOps, ExifTags

from app.core.image_quality_config import quality_settings
from app.schemas.image_analysis import (
    ImageAnalysisData,
    ImageCharacteristics,
    ProductPositionAnalysis,
)

logger = logging.getLogger(__name__)

# Enforce PIL decompression bomb protection
Image.MAX_IMAGE_PIXELS = quality_settings.max_image_pixels


def _extract_safe_exif(img: Image.Image) -> Optional[Dict[str, Any]]:
    """Extracts EXIF metadata safely into a JSON-serializable dictionary."""
    try:
        raw_exif = img.getexif()
        if not raw_exif:
            return None

        exif_dict: Dict[str, Any] = {}
        for tag_id, value in raw_exif.items():
            tag_name = ExifTags.TAGS.get(tag_id, f"Tag_{tag_id}")
            # Convert non-serializable objects (bytes, rationals, custom types)
            if isinstance(value, (int, float, str, bool)):
                exif_dict[tag_name] = value
            elif isinstance(value, bytes):
                try:
                    exif_dict[tag_name] = value.decode("utf-8", errors="ignore").strip("\x00")
                except Exception:
                    exif_dict[tag_name] = f"<{len(value)} bytes>"
            else:
                exif_dict[tag_name] = str(value)

        return exif_dict if exif_dict else None
    except Exception as e:
        logger.debug(f"Could not read EXIF data: {e}")
        return None


def _calculate_aspect_ratio(width: int, height: int) -> str:
    """Calculates standard or simplified aspect ratio string."""
    if width <= 0 or height <= 0:
        return "Unknown"
    gcd = math.gcd(width, height)
    rw, rh = width // gcd, height // gcd

    # Check common standard ratios with slight tolerance
    val = width / height
    common_ratios = [
        (1.0, "1:1"),
        (4 / 3, "4:3"),
        (16 / 9, "16:9"),
        (3 / 2, "3:2"),
        (5 / 4, "5:4"),
        (3 / 4, "3:4"),
        (9 / 16, "9:16"),
        (2 / 3, "2:3"),
    ]
    for target_val, name in common_ratios:
        if abs(val - target_val) < 0.02:
            return name

    # If reduced numbers are reasonably small, return them
    if rw < 100 and rh < 100:
        return f"{rw}:{rh}"
    return f"{round(val, 2)}:1"


def _analyze_product_position(
    gray: np.ndarray,
    alpha_mask: Optional[np.ndarray],
    width: int,
    height: int,
) -> ProductPositionAnalysis:
    """
    OpenCV-based candidate foreground localization.
    Heuristic only: does not claim definitive semantic product segmentation.
    """
    try:
        bbox: Optional[List[int]] = None
        has_foreground = False

        if alpha_mask is not None and np.any(alpha_mask):
            # Alpha mask gives direct non-transparent foreground boundary
            coords = np.argwhere(alpha_mask)
            y0, x0 = coords.min(axis=0)
            y1, x1 = coords.max(axis=0) + 1
            bbox = [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]
            has_foreground = True
        else:
            # Solid background: apply Otsu thresholding + edge saliency
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            
            # If inverted threshold has almost everything or nothing, test standard
            if np.mean(thresh == 255) > 0.85 or np.mean(thresh == 255) < 0.05:
                _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
            contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if contours:
                total_area = width * height
                # Filter for significant contours
                valid_cnts = [c for c in contours if cv2.contourArea(c) >= (total_area * 0.015)]
                if valid_cnts:
                    largest = max(valid_cnts, key=cv2.contourArea)
                    bx, by, bw, bh = cv2.boundingRect(largest)
                    bbox = [int(bx), int(by), int(bw), int(bh)]
                    has_foreground = True

        if has_foreground and bbox and bbox[2] > 0 and bbox[3] > 0:
            bx, by, bw, bh = bbox
            cx = bx + (bw / 2.0)
            cy = by + (bh / 2.0)

            # Compute normalized offset from image center [-1.0, 1.0]
            dx = (cx - (width / 2.0)) / (width / 2.0)
            dy = (cy - (height / 2.0)) / (height / 2.0)

            h_pos = "Center"
            if dx < -0.20:
                h_pos = "Left"
            elif dx > 0.20:
                h_pos = "Right"

            v_pos = "Center"
            if dy < -0.20:
                v_pos = "Top"
            elif dy > 0.20:
                v_pos = "Bottom"

            if h_pos == "Center" and v_pos == "Center":
                position_name = "Center"
            elif h_pos == "Center":
                position_name = v_pos
            elif v_pos == "Center":
                position_name = h_pos
            else:
                position_name = f"{v_pos}-{h_pos}"

            occupied_area = bw * bh
            total_area = width * height
            empty_ratio = max(0.0, min(1.0, 1.0 - (occupied_area / float(total_area))))
            has_large_empty = empty_ratio >= 0.80

            return ProductPositionAnalysis(
                potential_foreground_detected=True,
                approximate_bbox=bbox,
                object_position=position_name,
                has_large_empty_regions=has_large_empty,
                empty_region_ratio=round(empty_ratio, 4),
            )
    except Exception as e:
        logger.warning(f"Product position analysis error: {e}")

    return ProductPositionAnalysis(
        potential_foreground_detected=False,
        approximate_bbox=None,
        object_position=None,
        has_large_empty_regions=False,
        empty_region_ratio=0.0,
    )


def analyze_original_image(
    image_bytes: bytes,
    filename: str = "product.jpg",
) -> ImageAnalysisData:
    """
    Step 1: Original Image Analysis.
    Inspects image properties without altering or modifying the original bytes.
    """
    if not image_bytes:
        raise ValueError("Empty image data provided.")

    if len(image_bytes) > quality_settings.max_file_size_bytes:
        raise ValueError(
            f"Image file size ({round(len(image_bytes)/(1024*1024), 2)} MB) exceeds "
            f"configured maximum of {quality_settings.max_file_size_bytes // (1024*1024)} MB."
        )

    # 1. Open with Pillow to read raw metadata
    try:
        raw_pil = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        raise ValueError(f"Corrupted or unreadable image file: {e}")

    raw_format = (raw_pil.format or "").upper()
    if raw_format not in quality_settings.supported_formats:
        # Check by filename extension fallback
        ext = filename.rsplit(".", 1)[-1].upper() if "." in filename else ""
        if ext not in quality_settings.supported_formats:
            raise ValueError(
                f"Unsupported image format '{raw_format or ext}'. "
                f"Supported formats: {', '.join(sorted(quality_settings.supported_formats))}"
            )

    # Extract EXIF before transpose
    exif_data = _extract_safe_exif(raw_pil)

    # DPI extraction if present
    dpi_raw = raw_pil.info.get("dpi")
    dpi_tuple: Optional[Tuple[float, float]] = None
    if dpi_raw and isinstance(dpi_raw, (tuple, list)) and len(dpi_raw) >= 2:
        try:
            dpi_tuple = (float(round(dpi_raw[0], 2)), float(round(dpi_raw[1], 2)))
        except (ValueError, TypeError):
            dpi_tuple = None

    # Handle EXIF orientation: transpose to obtain the actual upright dimensions
    try:
        transposed_pil = ImageOps.exif_transpose(raw_pil)
        if transposed_pil is None:
            transposed_pil = raw_pil
    except Exception:
        transposed_pil = raw_pil

    width, height = transposed_pil.size
    if width <= 0 or height <= 0:
        raise ValueError("Invalid image dimensions (width or height <= 0).")

    file_size_kb = round(len(image_bytes) / 1024.0, 2)
    resolution_mp = round((width * height) / 1_000_000.0, 2)
    aspect_ratio_str = _calculate_aspect_ratio(width, height)

    if width == height:
        orientation = "Square"
    elif height > width:
        orientation = "Portrait"
    else:
        orientation = "Landscape"

    color_mode = transposed_pil.mode

    # 2. Convert to working OpenCV array for characteristic analysis
    alpha_mask: Optional[np.ndarray] = None

    if color_mode in ("RGBA", "LA") or (color_mode == "P" and "transparency" in transposed_pil.info):
        rgba_img = transposed_pil.convert("RGBA")
        np_rgba = np.array(rgba_img)
        alpha_channel = np_rgba[:, :, 3]
        alpha_mask = alpha_channel > 10

        # Composite against neutral medium gray (128,128,128) for sharpness (avoids false edge contrast)
        bg = Image.new("RGB", rgba_img.size, (128, 128, 128))
        bg.paste(rgba_img, mask=rgba_img.split()[-1])
        gray_for_sharpness = cv2.cvtColor(np.array(bg), cv2.COLOR_RGB2GRAY)

        # Grayscale for pixel intensity
        gray = cv2.cvtColor(np_rgba[:, :, :3], cv2.COLOR_RGB2GRAY)
        if np.any(alpha_mask):
            valid_pixels = gray[alpha_mask]
        else:
            valid_pixels = gray.flatten()
    else:
        rgb_img = transposed_pil.convert("RGB")
        np_rgb = np.array(rgb_img)
        gray = cv2.cvtColor(np_rgb, cv2.COLOR_RGB2GRAY)
        gray_for_sharpness = gray
        valid_pixels = gray.flatten()

    # Brightness (mean) and Contrast (std dev)
    brightness_mean = float(np.mean(valid_pixels)) if len(valid_pixels) > 0 else 0.0
    contrast_std = float(np.std(valid_pixels)) if len(valid_pixels) > 0 else 0.0

    # Sharpness via Laplacian variance
    laplacian_var = float(cv2.Laplacian(gray_for_sharpness, cv2.CV_64F).var())

    # Blur level classification
    if laplacian_var >= quality_settings.sharpness.sharp_min:
        blur_level = "Sharp"
    elif laplacian_var >= quality_settings.sharpness.slight_blur_min:
        blur_level = "Slightly Blurry"
    else:
        blur_level = "Very Blurry"

    # Extreme dark / overexposed ratios
    dark_ratio = float(np.mean(valid_pixels < 15)) if len(valid_pixels) > 0 else 0.0
    bright_ratio = float(np.mean(valid_pixels > 240)) if len(valid_pixels) > 0 else 0.0

    is_extremely_dark = (
        brightness_mean < quality_settings.brightness.too_dark_critical
        or dark_ratio > quality_settings.brightness.dark_pixel_ratio_critical
    )
    is_overexposed = (
        brightness_mean > quality_settings.brightness.too_bright_critical
        or bright_ratio > quality_settings.brightness.bright_pixel_ratio_critical
    )

    # Noise estimation (difference from 3x3 median blur)
    median_blur = cv2.medianBlur(gray, 3)
    noise_diff = np.abs(gray.astype(np.float32) - median_blur.astype(np.float32))
    if alpha_mask is not None and np.any(alpha_mask):
        noise_level = float(np.std(noise_diff[alpha_mask]))
    else:
        noise_level = float(np.std(noise_diff))

    characteristics = ImageCharacteristics(
        brightness_mean=round(brightness_mean, 2),
        contrast_std=round(contrast_std, 2),
        sharpness_laplacian_var=round(laplacian_var, 2),
        blur_level=blur_level,
        is_extremely_dark=is_extremely_dark,
        is_overexposed=is_overexposed,
        dark_pixel_ratio=round(dark_ratio, 4),
        bright_pixel_ratio=round(bright_ratio, 4),
        noise_level=round(noise_level, 2),
    )

    # 3. Product Position Analysis (Candidate / Heuristic)
    position_analysis = _analyze_product_position(gray, alpha_mask, width, height)

    return ImageAnalysisData(
        filename=filename,
        format=raw_format or "JPEG",
        width=width,
        height=height,
        resolution_megapixels=resolution_mp,
        file_size_kb=file_size_kb,
        aspect_ratio=aspect_ratio_str,
        orientation=orientation,
        color_mode=color_mode,
        dpi=dpi_tuple,
        exif=exif_data,
        characteristics=characteristics,
        product_position=position_analysis,
    )
