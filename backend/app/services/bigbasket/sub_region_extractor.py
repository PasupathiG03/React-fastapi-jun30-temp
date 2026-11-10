import io
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image

from app.core.logger import logger

# Global singleton OCR reader loaded once into memory
_OCR_READER = None


def get_ocr_reader():
    global _OCR_READER
    if _OCR_READER is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            engine = RapidOCR()

            class RapidOCRWrapper:
                def readtext(self, img_arr):
                    res, _ = engine(img_arr)
                    if not res:
                        return []
                    return [[r[0], r[1], float(r[2])] for r in res]

            _OCR_READER = RapidOCRWrapper()
            logger.info("Initialized high-speed RapidOCR ONNX engine.")
        except Exception as e:
            try:
                import easyocr
                _OCR_READER = easyocr.Reader(["en"], gpu=False)
                logger.info("Initialized EasyOCR engine.")
            except Exception as e2:
                logger.warning(f"No OCR engine available: {e}, {e2}")

                class DummyOCR:
                    def readtext(self, img_arr):
                        return []

                _OCR_READER = DummyOCR()
    return _OCR_READER


class SubRegionExtractor:
    """
    100% Dynamic, OCR & Computer-Vision driven AI decomposition of packaging.
    Locates text blocks, tables, regulatory marks, and barcodes dynamically on ANY packaging
    without hardcoded pixel or percentage coordinates.
    Strictly excludes price / MRP boxes per Bigbasket SRS V1.0 Section 5.
    """

    @classmethod
    def detect_and_extract_sub_regions(
        cls,
        image_bytes: bytes,
        bbid: str,
        category: str = "general",
        canvas_width: int = 2000,
        canvas_height: int = 2000,
        dpi: int = 150,
    ) -> List[Dict[str, Any]]:
        raw_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        orig_w, orig_h = raw_img.size
        arr = np.array(raw_img)

        # 1. Dynamic Text Localization using OCR
        ocr = get_ocr_reader()
        raw_ocr_results = ocr.readtext(arr)
        logger.info(f"Dynamic OCR detected {len(raw_ocr_results)} text lines for BBID {bbid}")

        # Clean and sort text lines by vertical position y1
        lines = []
        for bbox, text, conf in raw_ocr_results:
            if conf < 0.20:
                continue
            tl, tr, br, bl = bbox
            x1, y1 = int(min(tl[0], bl[0])), int(min(tl[1], tr[1]))
            x2, y2 = int(max(tr[0], br[0])), int(max(bl[1], br[1]))
            cleaned_text = text.strip()
            if not cleaned_text:
                continue
            lines.append({
                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                "text": cleaned_text,
                "conf": conf,
            })

        lines.sort(key=lambda item: item["y1"])

        # 3. Dynamically Identify Price / MRP Box to strictly exclude per SRS Section 5
        price_boxes = []
        for l in lines:
            t = l["text"].lower()
            # Catch price stamps like "MRP # ₹ 988", "₹ 1.52/ml", "Rs. 250", "₹ 99", "MRP 150"
            if re.search(r'(mrp|₹|\brs\.?)\s*#?\s*\d+', t) or (("mrp" in t) and ("?" in t or "₹" in t)) or re.search(r'/\s*ml', t):
                price_boxes.append(l)

        mrp_top = min([b["y1"] for b in price_boxes]) if price_boxes else orig_h

        # Dynamic Barcode Detection with MRP boundary awareness
        barcode_bbox = cls._detect_barcode_dynamic(arr, mrp_top=mrp_top)

        # 4. Determine if Food vs Non-Food/Kitchen packaging
        cat_lower = (category or "").lower().strip()
        if cat_lower in ("non_food", "non-food", "nonfood", "kitchen_items", "kitchen"):
            is_known_non_food = True
        elif cat_lower in ("food", "grocery"):
            is_known_non_food = False
        else:
            is_known_non_food = False

        # 5. Dynamic Section Discovery (robust to glued words in packaging OCR)
        nutri_patterns = [
            r'nutrition', r'nutritional', r'per\s*100', r'energy', r'approximate\s*value', r'typical\s*value'
        ]
        # Strictly match actual ingredient declarations (never confuse with directions or usage)
        ing_patterns = [
            r'\bingredients?\b', r'\bcomposition\b', r'\bactive\s+ingredients?\b'
        ]
        directions_patterns = [
            r'how\s*to\s*use', r'directions?', r'best\s*way\s*to\s*use', r'method\s*of\s*use'
        ]
        mfg_patterns = [
            r'mfd', r'mfg', r'manufactur', r'market', r'consumer', r'customercare', r'customer\s*care', r'packer', r'packed', r'pvt'
        ]
        fssai_patterns = [
            r'fssai', r'lic\s*(no|\.?)', r'license\s*(no|\.?)'
        ]
        caution_patterns = [
            r'caution', r'warning', r'first\s*aid', r'keep\s*(out|away)', r'for\s*external', r'flammable', r'irritan'
        ]

        # Scan line indices
        nutri_start_idx = None
        ing_start_idx = None
        directions_start_idx = None
        mfg_start_idx = None
        caution_start_idx = None
        fssai_indices = []

        for i, l in enumerate(lines):
            t = l["text"].lower()

            # Skip lines in the MRP price box
            if l["y2"] >= mrp_top and l in price_boxes:
                continue

            # Nutritional table (Food only)
            if not is_known_non_food and nutri_start_idx is None:
                if any(re.search(pat, t) for pat in nutri_patterns):
                    nutri_start_idx = i

            # True Ingredients Heading
            if ing_start_idx is None:
                if any(re.search(pat, t) for pat in ing_patterns):
                    ing_start_idx = i

            # Directions for use (stored as metadata; not an ingredient crop)
            if directions_start_idx is None:
                if any(re.search(pat, t) for pat in directions_patterns):
                    directions_start_idx = i

            # Safety / Caution (stored as metadata; never extracted as standalone image per SRS)
            if caution_start_idx is None:
                if any(re.search(pat, t) for pat in caution_patterns):
                    caution_start_idx = i

            # Manufacturer, Marketer, Packer
            if mfg_start_idx is None:
                if any(re.search(pat, t) for pat in mfg_patterns) and (ing_start_idx is None or i > ing_start_idx):
                    mfg_start_idx = i

            # FSSAI Regulatory (Food only)
            if not is_known_non_food:
                if any(re.search(pat, t) for pat in fssai_patterns):
                    fssai_indices.append(i)

        # 6. Extract Dynamic Crops in Sequence (Only SRS standard standalone information types)
        # Note: CAUTION is strictly excluded per BigBasket SRS V1.0 - caution belongs to the complete BOP.
        extracted_results = []
        current_seq = 3

        # EXTRACTION A: Nutritional Information (Food Only)
        if nutri_start_idx is not None:
            next_idx = min([idx for idx in [ing_start_idx, mfg_start_idx, len(lines)] if idx is not None and idx > nutri_start_idx])
            nutri_group = [lines[k] for k in range(nutri_start_idx, next_idx) if lines[k]["y2"] < mrp_top]
            if nutri_group:
                nx1 = max(0, min(b["x1"] for b in nutri_group) - 35)
                ny1 = max(0, min(b["y1"] for b in nutri_group) - 35)
                nx2 = min(orig_w, max(b["x2"] for b in nutri_group) + 35)
                ny2 = min(orig_h, max(b["y2"] for b in nutri_group) + 35)
                crop = arr[ny1:ny2, nx1:nx2]
                if crop.shape[0] > 30 and crop.shape[1] > 40:
                    cls._append_crop_result(
                        extracted_results,
                        crop,
                        category="nutritional",
                        display_name="Nutritional",
                        bbid=bbid,
                        seq=current_seq,
                        canvas_w=canvas_width,
                        canvas_h=canvas_height,
                        dpi=dpi,
                    )
                    current_seq += 1

        # EXTRACTION B: True Ingredients List (Only when actual ingredients heading is present)
        if ing_start_idx is not None:
            end_idx = mfg_start_idx if mfg_start_idx is not None and mfg_start_idx > ing_start_idx else len(lines)
            ing_group = [lines[k] for k in range(ing_start_idx, end_idx) if lines[k]["y2"] < mrp_top]
            if ing_group:
                ix1 = max(0, min(b["x1"] for b in ing_group) - 35)
                iy1 = max(0, min(b["y1"] for b in ing_group) - 35)
                ix2 = min(orig_w, max(b["x2"] for b in ing_group) + 35)
                iy2 = min(orig_h, max(b["y2"] for b in ing_group) + 35)
                crop = arr[iy1:iy2, ix1:ix2]
                if crop.shape[0] > 30 and crop.shape[1] > 40:
                    cls._append_crop_result(
                        extracted_results,
                        crop,
                        category="ingredient",
                        display_name="Ingredients",
                        bbid=bbid,
                        seq=current_seq,
                        canvas_w=canvas_width,
                        canvas_h=canvas_height,
                        dpi=dpi,
                    )
                    current_seq += 1

        # EXTRACTION C: Marketed / Manufactured By
        if mfg_start_idx is not None:
            mfg_group = [l for l in lines[mfg_start_idx:] if l["y2"] < mrp_top and l not in price_boxes]
            if mfg_group:
                mx1 = max(0, min(b["x1"] for b in mfg_group) - 20)
                my1 = max(0, min(b["y1"] for b in mfg_group) - 15)
                mx2 = min(orig_w, max(b["x2"] for b in mfg_group) + 20)
                my2 = min(orig_h, max(b["y2"] for b in mfg_group) + 15)
                crop = arr[my1:my2, mx1:mx2]
                if crop.shape[0] > 30 and crop.shape[1] > 40:
                    cls._append_crop_result(
                        extracted_results,
                        crop,
                        category="manufactured_by",
                        display_name="Marketed/Manufactured By",
                        bbid=bbid,
                        seq=current_seq,
                        canvas_w=canvas_width,
                        canvas_h=canvas_height,
                        dpi=dpi,
                    )
                    current_seq += 1

        # EXTRACTION D: FSSAI (Food Only)
        if fssai_indices:
            fssai_group = [lines[k] for k in fssai_indices if lines[k]["y2"] < mrp_top]
            if fssai_group:
                fx1 = max(0, min(b["x1"] for b in fssai_group) - 25)
                fy1 = max(0, min(b["y1"] for b in fssai_group) - 20)
                fx2 = min(orig_w, max(b["x2"] for b in fssai_group) + 25)
                fy2 = min(orig_h, max(b["y2"] for b in fssai_group) + 20)
                crop = arr[fy1:fy2, fx1:fx2]
                if crop.shape[0] > 20 and crop.shape[1] > 30:
                    cls._append_crop_result(
                        extracted_results,
                        crop,
                        category="fssai",
                        display_name="FSSAI",
                        bbid=bbid,
                        seq=current_seq,
                        canvas_w=canvas_width,
                        canvas_h=canvas_height,
                        dpi=dpi,
                    )
                    current_seq += 1

        # EXTRACTION E: Barcode (Dynamic Barcode Detector)
        if barcode_bbox is not None:
            bx1, by1, bx2, by2 = barcode_bbox
            # Ensure barcode crop does not enter the MRP box if located below
            if mrp_top < by2:
                by2 = mrp_top
            crop = arr[by1:by2, bx1:bx2]
            if crop.shape[0] >= 30 and crop.shape[1] >= 20:
                cls._append_crop_result(
                    extracted_results,
                    crop,
                    category="barcode",
                    display_name="Barcode",
                    bbid=bbid,
                    seq=current_seq,
                    canvas_w=canvas_width,
                    canvas_h=canvas_height,
                    dpi=dpi,
                )
                current_seq += 1

        return extracted_results

    @classmethod
    def _detect_barcode_dynamic(
        cls,
        arr: np.ndarray,
        mrp_top: Optional[int] = None,
    ) -> Optional[Tuple[int, int, int, int]]:
        """
        Dynamically locates the complete pixel coordinates of an EAN/UPC barcode on ANY packaging,
        including the full zebra bars, Human Readable Interpretation (HRI) digits, and GS1 quiet zones.
        Ensures neither the numbers nor the margins are cut off.
        """
        try:
            detector = cv2.barcode.BarcodeDetector()
            res = detector.detectAndDecode(arr)
            # res: (decoded_info, points, ...)
            points = res[1] if isinstance(res[1], np.ndarray) else (res[2] if len(res) > 2 and isinstance(res[2], np.ndarray) else None)
            if points is not None and len(points) > 0:
                pts = points.reshape(-1, 2)
                bx1 = int(np.min(pts[:, 0]))
                by1 = int(np.min(pts[:, 1]))
                bx2 = int(np.max(pts[:, 0]))
                by2 = int(np.max(pts[:, 1]))

                bw = bx2 - bx1
                bh = by2 - by1
                is_vertical = bh > bw

                h_img, w_img, _ = arr.shape
                gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)

                if is_vertical:
                    # Vertical barcode (height > width):
                    # The numbers are printed alongside the bars (usually on the right or left).
                    # Check which side has the digits by sampling dark pixels in 35px strips:
                    right_strip = gray[by1:by2, bx2:min(w_img, bx2 + 35)]
                    left_strip = gray[by1:by2, max(0, bx1 - 35):bx1]
                    right_dark = int(np.sum(right_strip < 130))
                    left_dark = int(np.sum(left_strip < 130))

                    # Allow 48px on the numbers side to capture all digits + quiet zone margin
                    # Allow 25px on the non-numbers side for quiet zone
                    if right_dark >= left_dark:
                        fx1 = max(0, bx1 - 25)
                        fx2 = min(w_img, bx2 + 48)
                    else:
                        fx1 = max(0, bx1 - 48)
                        fx2 = min(w_img, bx2 + 25)
                    fy1 = max(0, by1 - 20)
                    fy2 = min(h_img, by2 + 15)
                else:
                    # Standard horizontal barcode (width >= height):
                    # Numbers are printed below the bars, extending 35-45px.
                    fx1 = max(0, bx1 - 30)
                    fx2 = min(w_img, bx2 + 30)
                    fy1 = max(0, by1 - 20)
                    fy2 = min(h_img, by2 + 48)

                if mrp_top and fy2 > mrp_top:
                    fy2 = mrp_top - 5

                return (fx1, fy1, fx2, fy2)
        except Exception as e:
            logger.warning(f"Barcode detection error: {e}")
        return None

    @classmethod
    def _append_crop_result(
        cls,
        results_list: list,
        crop_arr: np.ndarray,
        category: str,
        display_name: str,
        bbid: str,
        seq: int,
        canvas_w: int,
        canvas_h: int,
        dpi: int,
    ):
        crop_img = Image.fromarray(crop_arr)

        canvas_bytes = cls._fit_to_standard_canvas(
            crop_img,
            target_w=canvas_w,
            target_h=canvas_h,
            dpi=dpi,
        )

        orig_buf = io.BytesIO()
        crop_img.save(orig_buf, format="PNG")

        results_list.append({
            "category": category,
            "display_name": display_name,
            "filename": f"{bbid}_{seq}.png",
            "sequence_order": seq,
            "crop_width": crop_arr.shape[1],
            "crop_height": crop_arr.shape[0],
            "canvas_bytes": canvas_bytes,
            "original_crop_bytes": orig_buf.getvalue(),
        })

    @classmethod
    def detect_information_sections(
        cls,
        image_bytes: bytes,
    ) -> Dict[str, Any]:
        """
        Dynamically analyzes packaging text to identify informational sections (metadata only).
        Never crops or replaces the complete product image.
        """
        try:
            raw_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            arr = np.array(raw_img)
            ocr = get_ocr_reader()
            raw_ocr = ocr.readtext(arr)

            detected = {
                "has_ingredients": False,
                "has_directions": False,
                "has_caution": False,
                "has_manufacturer": False,
                "has_fssai": False,
                "has_barcode": False,
                "has_nutrition": False,
                "sections": [],
            }

            text_all = " ".join(t.strip().lower() for _, t, conf in raw_ocr if conf > 0.25)

            if re.search(r'\bingredients?\b|\bcomposition\b', text_all):
                detected["has_ingredients"] = True
                detected["sections"].append("Ingredients")

            if re.search(r'direction|how\s*to\s*use|best\s*way\s*to\s*use|method\s*of\s*use', text_all):
                detected["has_directions"] = True
                detected["sections"].append("Directions to Use")

            if re.search(r'caution|warning|keep\s*(out|away)|first\s*aid', text_all):
                detected["has_caution"] = True
                detected["sections"].append("Caution & Safety")

            if re.search(r'manufactur|mfg|marketed|packed\s*by|consumer\s*care|pvt\s*ltd', text_all):
                detected["has_manufacturer"] = True
                detected["sections"].append("Manufacturer Details")

            if re.search(r'fssai|lic\s*no', text_all):
                detected["has_fssai"] = True
                detected["sections"].append("FSSAI")

            if re.search(r'nutrition|energy|protein|carbohydrate|fat|per\s*100', text_all):
                detected["has_nutrition"] = True
                detected["sections"].append("Nutritional Information")

            # Check barcode
            barcode_box = cls._detect_barcode_dynamic(arr)
            if barcode_box is not None:
                detected["has_barcode"] = True
                detected["sections"].append("Barcode")

            return detected
        except Exception as e:
            logger.warning(f"Could not extract info sections metadata: {e}")
            return {"sections": []}

    @classmethod
    def _fit_to_standard_canvas(
        cls,
        crop_img: Image.Image,
        target_w: int = 2000,
        target_h: int = 2000,
        dpi: int = 150,
    ) -> bytes:
        crop_rgba = crop_img.convert("RGBA")
        cw, ch = crop_rgba.size

        # Content-aware layout: Scale to maximize readability while preventing large stark voids
        # Leave comfortable 60px safe margin around the canvas boundary
        safe_w = target_w - 120
        safe_h = target_h - 120

        scale = min(safe_w / cw, safe_h / ch)
        scaled_w = max(50, int(cw * scale))
        scaled_h = max(50, int(ch * scale))

        scaled_img = crop_rgba.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)

        # Solid clean white canvas (255, 255, 255, 255) for informational panels
        canvas = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
        offset_x = (target_w - scaled_w) // 2
        offset_y = (target_h - scaled_h) // 2
        canvas.paste(scaled_img, (offset_x, offset_y), scaled_img)

        buf = io.BytesIO()
        canvas.save(buf, format="PNG", dpi=(dpi, dpi))
        return buf.getvalue()
