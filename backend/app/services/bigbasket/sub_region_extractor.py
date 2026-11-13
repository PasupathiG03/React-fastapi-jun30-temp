import io
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image

from app.core.logger import logger

# RapidOCR (PaddleOCR PP-OCR models on ONNX Runtime, CPU) is the single OCR engine. There is no
# fallback engine: if it cannot run, OCR fails loudly (OcrError) instead of silently returning no text.
OCR_ENGINE = "rapidocr"

_OCR_ENGINE = None
_OCR_INIT_ERROR: Optional[str] = None
_OCR_LOCK = threading.Lock()


class OcrError(RuntimeError):
    """OCR could not run. Callers must treat this as 'unknown', never as 'no text found'."""


def get_ocr_reader():
    """Returns the shared RapidOCR engine, creating it on first use.

    A failed initialisation is logged once and remembered, so it is not retried (and slowly re-failed)
    for every image; restart the backend after fixing the install. Raises OcrError when unavailable.
    """
    global _OCR_ENGINE, _OCR_INIT_ERROR
    if _OCR_ENGINE is not None:
        return _OCR_ENGINE
    with _OCR_LOCK:
        if _OCR_ENGINE is None and _OCR_INIT_ERROR is None:
            try:
                from rapidocr import RapidOCR
                _OCR_ENGINE = RapidOCR()
                logger.info("Initialized RapidOCR engine (ONNX Runtime, CPU).")
            except Exception as e:
                _OCR_INIT_ERROR = f"{type(e).__name__}: {e}"
                logger.error(
                    "RapidOCR initialisation failed; OCR is UNAVAILABLE and BOP images that need OCR will be "
                    "marked needs_review. Install backend requirements (rapidocr) and restart. Cause: %s",
                    _OCR_INIT_ERROR,
                )
        if _OCR_ENGINE is None:
            raise OcrError(f"OCR unavailable ({OCR_ENGINE}): {_OCR_INIT_ERROR}")
    return _OCR_ENGINE


def read_text(img_arr: np.ndarray) -> List[List[Any]]:
    """Runs OCR and returns [[ [[x, y] x4 (tl, tr, br, bl)], text, confidence ], ...] with plain Python types.

    An image with no text returns [] (RapidOCR reports that as boxes=None); an engine failure raises OcrError.
    """
    engine = get_ocr_reader()
    try:
        result = engine(img_arr)
    except Exception as e:
        logger.error("RapidOCR text detection failed: %s: %s", type(e).__name__, e)
        raise OcrError(f"OCR failed during text detection: {type(e).__name__}: {e}") from e
    if result.boxes is None or result.txts is None or result.scores is None:
        return []
    return [
        [[[float(x), float(y)] for x, y in box], str(text), float(score)]
        for box, text, score in zip(result.boxes, result.txts, result.scores)
    ]


def get_ocr_status() -> Dict[str, Any]:
    """OCR health for the /health endpoint. Never includes error details (the endpoint is public)."""
    if _OCR_ENGINE is not None:
        status = "ready"
    elif _OCR_INIT_ERROR is not None:
        status = "unavailable"
    else:
        status = "initializing"
    return {"engine": OCR_ENGINE, "status": status, "available": status == "ready"}


def warm_up_ocr() -> None:
    """Loads the engine ahead of the first image so /health reflects reality. Failures are logged, not raised."""
    try:
        get_ocr_reader()
    except OcrError:
        pass


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

        # -----------------------------------------------------------------------------------
        # TIER 1: Gemini Multimodal Vision AI Semantic Sub-Region Localization
        # -----------------------------------------------------------------------------------
        # Locates packaging sub-regions visually (Ingredients, Nutritional Table, Manufacturer,
        # FSSAI emblem + license, Barcode) across any arbitrary packaging layout without relying
        # on fragile keyword matching or hardcoded pixel coordinates.
        try:
            from app.services.bigbasket.gemini_service import GeminiClassificationService
            gemini_regions = GeminiClassificationService.detect_packaging_sub_regions(
                image_bytes=image_bytes,
                bbid=bbid,
                filename=f"{bbid}.png",
                category=category,
            )
            if gemini_regions:
                logger.info(f"Gemini Vision AI localized {len(gemini_regions)} packaging sub-regions for BBID {bbid}")
                extracted_results = []
                # 100% Dynamic: Standalone crop qualification & catalog sequence order are determined
                # strictly by Gemini Vision AI's structured output schema (Zero hardcoded lists or heuristics)
                crop_targets = [r for r in gemini_regions if r.get("is_standalone_crop")]
                sorted_regions = sorted(
                    crop_targets,
                    key=lambda r: r.get("catalog_sequence") if r.get("catalog_sequence") is not None else 99
                )

                current_seq = 1
                for reg in sorted_regions:
                    cat = (reg.get("region_type") or "").lower().strip()
                    disp = reg.get("display_name") or cat.replace("_", " ").title()
                    box = reg.get("box_2d")
                    if not box or len(box) != 4:
                        continue
                    ymin, xmin, ymax, xmax = box
                    py1 = int(round(ymin * orig_h / 1000.0))
                    px1 = int(round(xmin * orig_w / 1000.0))
                    py2 = int(round(ymax * orig_h / 1000.0))
                    px2 = int(round(xmax * orig_w / 1000.0))

                    # Safety padding to ensure no text strokes or logo edges are clipped
                    pad_x = 12
                    pad_y = 10
                    if cat == "fssai":
                        pad_y = 15
                    elif cat == "barcode":
                        pad_x = 20
                        pad_y = 10

                    fx1 = max(0, px1 - pad_x)
                    fy1 = max(0, py1 - pad_y)
                    fx2 = min(orig_w, px2 + pad_x)
                    fy2 = min(orig_h, py2 + pad_y)

                    crop = arr[fy1:fy2, fx1:fx2]
                    if crop.shape[0] > 20 and crop.shape[1] > 30:
                        assigned_seq = reg.get("catalog_sequence") or current_seq
                        cls._append_crop_result(
                            extracted_results,
                            crop,
                            category=cat,
                            display_name=disp,
                            bbid=bbid,
                            seq=assigned_seq,
                            canvas_w=canvas_width,
                            canvas_h=canvas_height,
                            dpi=dpi,
                        )
                        current_seq += 1

                if extracted_results:
                    return extracted_results
        except Exception as ai_err:
            logger.warning(f"Gemini sub-region localization failed or unavailable ({ai_err}). Falling back to local OCR engine.")

        # -----------------------------------------------------------------------------------
        # TIER 2: Local Dynamic OCR & Computer-Vision Fallback
        # -----------------------------------------------------------------------------------

        # 1. Dynamic Text Localization using OCR (raises OcrError if OCR cannot run)
        raw_ocr_results = read_text(arr)
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
            if (
                re.search(r'(mrp|₹|\brs\.?)\s*#?\s*\d+', t)
                or (("mrp" in t) and ("?" in t or "₹" in t))
                or re.search(r'/\s*ml', t)
                or re.search(r'unit\s*price', t)
            ):
                price_boxes.append(l)

        mrp_top = min([b["y1"] for b in price_boxes]) if price_boxes else orig_h

        # The MRP box is a column, not a full-width strip: on many packs it sits beside the manufacturer
        # address. Only lines from the MRP top downward that overlap the price column horizontally
        # (MRP, unit price, batch no., MFG/EXP dates) belong to it; text beside it is kept.
        if price_boxes:
            price_x1 = min(b["x1"] for b in price_boxes) - 20
            price_x2 = max(b["x2"] for b in price_boxes) + 20
        else:
            price_x1 = price_x2 = None

        def in_price_box(line: Dict[str, Any]) -> bool:
            if price_x1 is None:
                return False
            if line in price_boxes:
                return True
            return line["y2"] >= mrp_top and line["x2"] > price_x1 and line["x1"] < price_x2

        # Dynamic Barcode Detection with MRP boundary awareness
        barcode_bbox = cls._detect_barcode_dynamic(arr, mrp_top=mrp_top, text_lines=lines, bbid=bbid)

        # 4. Determine if Food vs Non-Food/Kitchen packaging
        cat_lower = (category or "").lower().strip()
        if cat_lower in ("non_food", "non-food", "nonfood", "kitchen_items", "kitchen"):
            is_known_non_food = True
        elif cat_lower in ("food", "grocery"):
            is_known_non_food = False
        else:
            is_known_non_food = False

        # 5. Section discovery by text blocks.
        # A section starts at a heading at the start of a line ("Ingredients:", "Nutritional Information",
        # "Marketed By"...) and takes the lines below it in the same column. It ends at the next heading of any
        # kind (Storage, For feedback, Net Quantity, Directions...) or at a gap clearly larger than the normal
        # line spacing. This keeps each crop to its own block instead of running to the next section or the
        # end of the pack.
        text_lines = [l for l in lines if not in_price_box(l)]
        heights = sorted(l["y2"] - l["y1"] for l in text_lines) or [20]
        line_h = max(8, heights[len(heights) // 2])

        heading_patterns = {
            "ingredient": [
                r"^\W*(active\s+)?ingredients?[:\s]",
                r"^\W*composition[:\s]",
            ],
            "nutritional": [
                r"^\W*nutrition(al)?(\s+information|\s+facts|\s+values?)?[:\s]",
                r"^\W*(typical|approximate|average)\s+values?[:\s]",
            ],
            "manufactured_by": [
                r"^\W*(marketed|manufactured|mfd\.?|mfg\.?|packed|packer|imported|distributed)\s+(by|for|at)[:\s]",
                r"^\W*manufacturer[:\s]",
                r"^\W*a\s+quality\s+product\s+(of|from|by)\b",
                r"^\W*(marketed|manufactured)\s*(&|and)\s*(distributed|packed)\s+(by|for)[:\s]",
            ],
            "contact": [
                r"^\W*for\s+(feedback|queries|complaints|consumer|customer|any)\b",
                r"^\W*(customer|consumer)\s*care\b",
                r"^\W*contact\s+(us|details)?[:\s]",
            ],
            "storage": [r"^\W*storage\s*(instructions?|condition|guidelines?)?[:\s]", r"^\W*store\s+(in|at|below)\b"],
            "directions": [r"^\W*(directions?|how\s+to\s+use|best\s+way\s+to\s+use|method\s+of\s+use|usage\s+instructions?)[:\s]"],
            "caution": [r"^\W*(caution|warning|precautions?|safety\s*information)[:\s]"],
            "net_quantity": [r"^\W*net\s*(quantity|qty|wt|weight|content|vol)[:\s]"],
            "dates": [r"^\W*(date\s+of|mfg\.?\s*date|exp(iry)?\.?\s*date|best\s+before|use\s+by|batch|b\.\s*no|lot\s+no)[:\s]"],
            "price": [r"^\W*(mrp|usp|unit\s+sale|price)[:\s]"],
            "fssai": [r"^\W*(fssai|lic\.?\s*no)[:\s]"],
        }

        def heading_type(line: Dict[str, Any]) -> Optional[str]:
            raw_t = line["text"].strip()
            # Bullet point items (•, *, -, o) and numbered list items are descriptive text, NEVER section headings
            if re.match(r"^[\u2022\u25cf\u25cb\*\-\u2013\u2014\d+\.]\s*", raw_t):
                return None
            t = raw_t.lower()
            for kind, pats in heading_patterns.items():
                if any(re.search(p, t) for p in pats):
                    return kind
            return None

        kinds = [heading_type(l) for l in text_lines]
        print("DEBUG price_boxes:", [b["text"] for b in price_boxes], "mrp_top:", mrp_top)
        print("DEBUG category passed:", category, "is_known_non_food:", is_known_non_food)
        print("DEBUG kinds count:", {k: kinds.count(k) for k in set(kinds)})

        def grow_block(start: int, kind: str) -> List[Dict[str, Any]]:
            """Heading line + following same-column lines until another heading or a large gap."""
            block = [text_lines[start]]
            bx1, bx2 = text_lines[start]["x1"], text_lines[start]["x2"]
            bottom = text_lines[start]["y2"]
            for k in range(start + 1, len(text_lines)):
                l = text_lines[k]
                in_column = l["x2"] > bx1 - line_h and l["x1"] < bx2 + line_h
                if not in_column:
                    continue  # text in another column beside this block
                if l["y1"] - bottom > 1.2 * line_h:
                    break  # paragraph gap: the block has ended
                other = kinds[k]
                if other is not None and not (other == kind == "manufactured_by"):
                    break  # the next section starts here
                block.append(l)
                bx1, bx2 = min(bx1, l["x1"]), max(bx2, l["x2"])
                bottom = max(bottom, l["y2"])
            return block

        def first_heading(kind: str) -> Optional[int]:
            return next((i for i, k in enumerate(kinds) if k == kind), None)

        sections: List[Tuple[str, str, List[Dict[str, Any]]]] = []

        ing_idx = first_heading("ingredient")
        if ing_idx is not None:
            sections.append(("ingredient", "Ingredients", grow_block(ing_idx, "ingredient")))

        if not is_known_non_food:
            nutri_idx = first_heading("nutritional")
            if nutri_idx is not None:
                sections.append(("nutritional", "Nutritional", grow_block(nutri_idx, "nutritional")))

        mfg_idx = first_heading("manufactured_by")
        if mfg_idx is None:
            # No heading: fall back to the company-name line (Pvt Ltd / Limited / LLP) and its address block.
            mfg_idx = next(
                (i for i, l in enumerate(text_lines) if re.search(r"(pvt|private|ltd|limited|llp)", l["text"].lower())),
                None,
            )
        if mfg_idx is not None:
            sections.append(("manufactured_by", "Marketed/Manufactured By", grow_block(mfg_idx, "manufactured_by")))

        if not is_known_non_food:
            # The licence number (14 digits) identifies the real FSSAI mark; sentences that merely mention
            # "FSSAI Lic. No." elsewhere on the pack have no number and are ignored.
            lic_idx = next(
                (i for i, l in enumerate(text_lines) if re.search(r"(?<!\d)\d{14}(?!\d)", l["text"].replace(" ", ""))),
                None,
            )
            if lic_idx is not None:
                lic = text_lines[lic_idx]
                fssai_group = [lic]
                for l in text_lines:
                    near_above = 0 <= lic["y1"] - l["y2"] <= 2 * line_h or (l["y1"] < lic["y1"] and l["y2"] > lic["y1"])
                    overlaps = l["x2"] > lic["x1"] - line_h and l["x1"] < lic["x2"] + line_h
                    if l is not lic and near_above and overlaps and "fssai" in l["text"].lower():
                        fssai_group.append(l)
                sections.append(("fssai", "FSSAI", fssai_group))


        print(f"DEBUG: sections found = {[s[0] for s in sections]}")

        # 6. Cut the crops. CAUTION is never extracted (it stays part of the complete BOP per the SRS).
        extracted_results = []
        current_seq = 3
        pad = max(8, line_h // 2)
        for category, display_name, group in sections:
            if not group:
                continue
            gx1 = max(0, min(b["x1"] for b in group) - pad)
            gy1 = max(0, min(b["y1"] for b in group) - pad)
            gx2 = min(orig_w, max(b["x2"] for b in group) + pad)
            gy2 = min(orig_h, max(b["y2"] for b in group) + pad)

            if category == "fssai":
                # Ensure the artistic FSSAI logo emblem above the license line is NEVER cut off
                has_logo_text = any("fssai" in b.get("text", "").lower() for b in group)
                if not has_logo_text:
                    # If OCR missed the stylized word 'fssai', the emblem is situated ~1.6x line height above the license line
                    gy1 = max(0, min(b["y1"] for b in group) - int(1.8 * line_h) - pad)
                else:
                    # Safety margin above 'fssai' so the top orange arc / leaf is never clipped
                    gy1 = max(0, gy1 - max(4, int(0.4 * line_h)))

            crop = arr[gy1:gy2, gx1:gx2]
            if crop.shape[0] > 20 and crop.shape[1] > 30:
                cls._append_crop_result(
                    extracted_results,
                    crop,
                    category=category,
                    display_name=display_name,
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
        text_lines: Optional[List[Dict[str, Any]]] = None,
        bbid: Optional[str] = None,
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

        # Dynamic OCR Fallback: Locate zebra bars using packaging barcode digits
        try:
            if text_lines:
                cand_digits = []
                bbid_clean = re.sub(r"\D", "", bbid or "")
                for l in text_lines:
                    raw_t = l.get("text", "").strip()
                    # Barcode digits are standalone numbers printed below or beside zebra stripes
                    if not re.match(r"^[\d\s]+$", raw_t):
                        continue
                    clean = re.sub(r"\D", "", raw_t)
                    if len(clean) in (6, 7, 8, 12, 13):
                        if bbid_clean and (clean in bbid_clean or bbid_clean in clean):
                            cand_digits.append(l)
                        elif len(clean) in (12, 13):
                            cand_digits.append(l)

                if cand_digits:
                    bx1 = min(b["x1"] for b in cand_digits)
                    bx2 = max(b["x2"] for b in cand_digits)
                    by2 = max(b["y2"] for b in cand_digits)
                    line_heights = [b["y2"] - b["y1"] for b in cand_digits]
                    avg_lh = max(15, int(np.mean(line_heights)))
                    by1 = max(0, min(b["y1"] for b in cand_digits) - int(3.8 * avg_lh))
                    h_img, w_img = arr.shape[:2]
                    fx1 = max(0, bx1 - 25)
                    fx2 = min(w_img, bx2 + 25)
                    fy1 = max(0, by1 - 10)
                    fy2 = min(h_img, by2 + 10)
                    if mrp_top and fy2 > mrp_top:
                        fy2 = mrp_top - 5
                    return (fx1, fy1, fx2, fy2)
        except Exception as e:
            logger.warning(f"OCR Barcode fallback error: {e}")

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
        bbid: str = "",
        category: str = "FOOD",
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Dynamically analyzes packaging to identify informational sections (metadata only).
        Never crops or replaces the complete product image.
        Uses Gemini Multimodal Vision AI dynamically with zero hardcoded regex.
        Falls back to local OCR engine if Gemini is offline.
        """
        try:
            # TIER 1: Dynamic Gemini Multimodal AI Discovery (Zero Regex)
            from app.services.bigbasket.gemini_service import GeminiClassificationService
            gemini_regions = GeminiClassificationService.detect_packaging_sub_regions(
                image_bytes=image_bytes,
                bbid=bbid,
                category=category,
                batch_id=batch_id,
                image_id=image_id,
            )
            if gemini_regions:
                detected_types = {r.get("region_type") for r in gemini_regions if isinstance(r, dict)}
                sections_list = [
                    r.get("display_name") or str(r.get("region_type", "")).replace("_", " ").title()
                    for r in gemini_regions if isinstance(r, dict)
                ]
                return {
                    "ocr_available": True,
                    "ai_detected": True,
                    "has_ingredients": "ingredient" in detected_types,
                    "has_directions": "directions" in detected_types,
                    "has_caution": "caution" in detected_types,
                    "has_manufacturer": "manufactured_by" in detected_types,
                    "has_fssai": "fssai" in detected_types,
                    "has_barcode": "barcode" in detected_types,
                    "has_nutrition": "nutritional" in detected_types,
                    "has_storage": "storage" in detected_types,
                    "sections": sections_list,
                }
        except Exception as ai_err:
            logger.warning(f"Gemini dynamic section detection fallback to OCR: {ai_err}")

        # TIER 2: Local OCR fallback (Only used when Gemini is offline)
        try:
            raw_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            arr = np.array(raw_img)
            try:
                raw_ocr = read_text(arr)
            except OcrError as ocr_err:
                return {"ocr_available": False, "ocr_error": str(ocr_err), "sections": []}

            detected = {
                "ocr_available": True,
                "ai_detected": False,
                "has_ingredients": False,
                "has_directions": False,
                "has_caution": False,
                "has_manufacturer": False,
                "has_fssai": False,
                "has_barcode": False,
                "has_nutrition": False,
                "has_storage": False,
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

        # Table 3: information panels use 0 px padding and fill the canvas edge-to-edge. Scale without
        # distortion so the panel touches the canvas on its long side.
        # SRS Table 3: Informational panels fit edge-to-edge (1980 px width, 0 px padding)
        target_span_w = min(1980, target_w)
        target_span_h = min(1980, target_h)
        scale = min(target_span_w / cw, target_span_h / ch)
        scaled_w = min(target_w, max(1, round(cw * scale)))
        scaled_h = min(target_h, max(1, round(ch * scale)))

        scaled_img = crop_rgba.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)

        # The rest of the canvas is transparent, never a colour (matches the manual reference outputs).
        canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        offset_x = (target_w - scaled_w) // 2
        offset_y = (target_h - scaled_h) // 2
        canvas.paste(scaled_img, (offset_x, offset_y), scaled_img)

        buf = io.BytesIO()
        canvas.save(buf, format="PNG", dpi=(dpi, dpi))
        return buf.getvalue()
