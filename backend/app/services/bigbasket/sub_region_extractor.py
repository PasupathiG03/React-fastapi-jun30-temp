import io
import re
import threading
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

from app.core.logger import logger

# RapidOCR (PaddleOCR PP-OCR models on ONNX Runtime, CPU) is the single OCR engine. There is no
# fallback engine: if it cannot run, OCR fails loudly (OcrError) instead of silently returning no text.
OCR_ENGINE = "rapidocr"

_OCR_ENGINE = None
_OCR_INIT_ERROR: Optional[str] = None
_OCR_LOCK = threading.Lock()
# Images are processed in parallel threads; OCR inference is serialised (it is a CPU-bound fallback path).
_OCR_RUN_LOCK = threading.Lock()


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
        with _OCR_RUN_LOCK:
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
    def _get_chroma(cls, bgr_strip: np.ndarray) -> float:
        """Calculates color saturation / chromaticity to distinguish packaging background from neutral cards."""
        if bgr_strip.size == 0:
            return 0.0
        b = bgr_strip[..., 0].astype(float)
        g = bgr_strip[..., 1].astype(float)
        r = bgr_strip[..., 2].astype(float)
        return float(np.mean(np.maximum(np.abs(b - g), np.maximum(np.abs(g - r), np.abs(r - b)))))

    @classmethod
    def _find_horizontal_line(
        cls,
        gray: np.ndarray,
        x1: int,
        x2: int,
        y_anchor: int,
        search_range: Tuple[int, int] = (-30, 30),
        min_line_w: int = 45,
    ) -> Optional[int]:
        """Detects physical horizontal table/box border lines using morphological opening."""
        h, w = gray.shape[:2]
        y_start = max(0, y_anchor + search_range[0])
        y_end = min(h, y_anchor + search_range[1])
        if y_end <= y_start:
            return None
        sx1 = max(0, min(x1, w - 1))
        sx2 = max(0, min(x2, w))
        if sx2 - sx1 < min_line_w:
            return None
        roi = gray[y_start:y_end, sx1:sx2]
        if roi.size == 0:
            return None
        thresh = cv2.adaptiveThreshold(~roi, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 15, -2)
        horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_line_w, 1))
        horiz = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horiz_kernel)
        line_scores = np.sum(horiz > 0, axis=1)
        best_row = int(np.argmax(line_scores))
        if line_scores[best_row] >= min_line_w:
            return y_start + best_row
        return None

    @classmethod
    def _find_vertical_line(
        cls,
        gray: np.ndarray,
        y1: int,
        y2: int,
        x_anchor: int,
        search_range: Tuple[int, int] = (-30, 30),
    ) -> Optional[int]:
        """Vertical counterpart of _find_horizontal_line: a physical border running most of the block's height."""
        h, w = gray.shape[:2]
        x_start = max(0, x_anchor + search_range[0])
        x_end = min(w, x_anchor + search_range[1])
        sy1, sy2 = max(0, y1), min(h, y2)
        min_line_h = max(30, int(0.5 * (sy2 - sy1)))
        if x_end <= x_start or sy2 - sy1 < min_line_h:
            return None
        roi = gray[sy1:sy2, x_start:x_end]
        if roi.size == 0:
            return None
        thresh = cv2.adaptiveThreshold(~roi, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 15, -2)
        vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_line_h))
        vert = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vert_kernel)
        col_scores = np.sum(vert > 0, axis=0)
        best_col = int(np.argmax(col_scores))
        if col_scores[best_col] >= min_line_h:
            return x_start + best_col
        return None

    @classmethod
    def _clamp_to_panel_or_card(
        cls,
        arr: np.ndarray,
        px1: int,
        py1: int,
        px2: int,
        py2: int,
        max_pad_x: int = 18,
    ) -> Tuple[int, int]:
        """
        Adaptively expands horizontal boundaries (px1, px2) up to max_pad_x,
        stopping strictly before crossing physical panel borders, color transitions, or seam edges.
        Prevents white slivers on colored panels and background bleed on white cards.
        """
        h, w = arr.shape[:2]
        cx1 = min(w - 1, max(0, px1 + 10))
        cx2 = min(w - 1, max(0, px2 - 10))
        cy1 = min(h - 1, max(0, py1 + 10))
        cy2 = min(h - 1, max(0, py2 - 10))
        if cx2 > cx1 and cy2 > cy1:
            roi = arr[cy1:cy2, cx1:cx2]
            med_bgr = np.median(roi.reshape(-1, 3), axis=0)
        else:
            med_bgr = arr[py1:py2, px1:px2].mean(axis=(0, 1))

        med_chroma = cls._get_chroma(med_bgr.reshape(1, 3))

        fx1 = px1
        for step in range(1, max_pad_x + 1):
            x = px1 - step
            if x < 0:
                break
            col = arr[py1:py2, x]
            col_chroma = cls._get_chroma(col)
            color_diff = np.mean(np.linalg.norm(col.astype(float) - med_bgr, axis=1))
            if med_chroma > 35:
                if col_chroma < med_chroma * 0.70:
                    break
            else:
                if col_chroma > 30 or color_diff > 35:
                    break
            fx1 = x

        fx2 = px2
        for step in range(1, max_pad_x + 1):
            x = px2 + step
            if x >= w:
                break
            col = arr[py1:py2, x]
            col_chroma = cls._get_chroma(col)
            color_diff = np.mean(np.linalg.norm(col.astype(float) - med_bgr, axis=1))
            if med_chroma > 35:
                if col_chroma < med_chroma * 0.70:
                    break
            else:
                if col_chroma > 30 or color_diff > 35:
                    break
            fx2 = x

        return fx1, fx2

    @staticmethod
    def _is_barcode_digit_text(text: str) -> bool:
        """Barcode human-readable digits: (almost) only digits, optionally guard marks. Letters (a licence line,
        phone numbers with words, dates with units) make a line ineligible, so no keyword list is needed."""
        t = re.sub(r"[\s<>\"']", "", text)
        if not t:
            return False
        digits = sum(ch.isdigit() for ch in t)
        return digits >= 1 and digits / len(t) >= 0.85 and (digits >= 6 or len(t) <= 2)

    @staticmethod
    def _locate_barcode_near(
        arr: np.ndarray, px1: int, py1: int, px2: int, py2: int
    ) -> Optional[Tuple[int, int, int, int]]:
        """Finds the full barcode symbol around a rough box (e.g. a vision-model box that only covers the
        human-readable digits beside a vertical barcode). OpenCV's detector misses small barcodes on a full
        page, so it searches a window padded by the box's longest side, at 1x and 2x scale, and returns the
        detection that overlaps the box (or None)."""
        h, w = arr.shape[:2]
        pad = max(px2 - px1, py2 - py1)
        wx1, wy1 = max(0, px1 - pad), max(0, py1 - pad)
        wx2, wy2 = min(w, px2 + pad), min(h, py2 + pad)
        roi = arr[wy1:wy2, wx1:wx2]
        if roi.size == 0:
            return None
        try:
            detector = cv2.barcode.BarcodeDetector()
        except Exception:
            return None
        best, best_overlap = None, 0
        for scale in (1, 2):
            img = roi if scale == 1 else cv2.resize(roi, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            try:
                ok, pts = detector.detect(img)
            except Exception:
                continue
            if not ok or pts is None:
                continue
            for quad in np.asarray(pts).reshape(-1, 4, 2):
                q = quad / scale
                qx1, qy1 = int(q[:, 0].min()) + wx1, int(q[:, 1].min()) + wy1
                qx2, qy2 = int(q[:, 0].max()) + wx1, int(q[:, 1].max()) + wy1
                overlap = max(0, min(qx2, px2) - max(qx1, px1)) * max(0, min(qy2, py2) - max(qy1, py1))
                if overlap > best_overlap:
                    best, best_overlap = (qx1, qy1, qx2, qy2), overlap
        if best is None:
            return None
        # Detector quads sit slightly inside the outer guard bars; a small margin keeps them whole.
        m = max(3, int(round(0.03 * max(best[2] - best[0], best[3] - best[1]))))
        return max(0, best[0] - m), max(0, best[1] - m), min(w, best[2] + m), min(h, best[3] + m)

    @classmethod
    def _refine_barcode_boundary(
        cls,
        arr: np.ndarray,
        px1: int,
        py1: int,
        px2: int,
        py2: int,
        ocr_lines: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[int, int, int, int]:
        """
        Dynamically refines 1D/2D barcode boundaries:
        1. Encloses dark zebra bars and numeric digits detected via connected components and OCR lines.
        2. Preserves quiet zone margins (10-25px) on neutral cards.
        3. Strictly halts and clamps boundaries BEFORE crossing into chromatic packaging backgrounds
           (e.g. orange bottom folds or colored panel margins) or dark boundary seams.
        """
        h, w = arr.shape[:2]
        # The given box can cover only part of the symbol (just the digit column of a vertical barcode, or
        # just the bars without the digits). Grow it to the detected symbol before refining.
        symbol = cls._locate_barcode_near(arr, px1, py1, px2, py2)
        if symbol is not None:
            px1, py1 = min(px1, symbol[0]), min(py1, symbol[1])
            px2, py2 = max(px2, symbol[2]), max(py2, symbol[3])
        sx1 = max(0, px1 - 35)
        sy1 = max(0, py1 - 35)
        sx2 = min(w, px2 + 35)
        sy2 = min(h, py2 + 35)
        roi = arr[sy1:sy2, sx1:sx2]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.ndim == 3 else roi
        full_gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY) if arr.ndim == 3 else arr

        bar_text_lines = []
        if ocr_lines:
            bar_text_lines = [
                l for l in ocr_lines
                if max(sx1, l["x1"]) < min(sx2, l["x2"])
                and max(sy1, l["y1"]) < min(sy2, l["y2"])
                and not bool(re.search(r'[/:\-]', l["text"]))
                and cls._is_barcode_digit_text(l["text"])
            ]

        dark_mask = (gray < 115).astype(np.uint8)
        is_vertical = (py2 - py1) > (px2 - px1)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 15) if is_vertical else (15, 5))
        closed = cv2.morphologyEx(dark_mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        valid_c = []
        for c in contours:
            bx, by, bw, bh = cv2.boundingRect(c)
            if bh > 25 and bw > 25 and (bw / max(1, bh)) < 3.5:
                c_crop = roi[by:by+bh, bx:bx+bw]
                if cls._get_chroma(c_crop) < 30:
                    valid_c.append((bx, by, bw, bh))

        if valid_c:
            target_x1, target_y1, target_x2, target_y2 = symbol if symbol is not None else (px1, py1, px2, py2)
            overlapping_c = [
                (bx, by, bw, bh) for (bx, by, bw, bh) in valid_c
                if max(sx1 + bx, target_x1) < min(sx1 + bx + bw, target_x2)
                and max(sy1 + by, target_y1) < min(sy1 + by + bh, target_y2)
            ]
            if overlapping_c:
                valid_c = overlapping_c
            if bar_text_lines:
                dt_x1 = min(l["x1"] for l in bar_text_lines)
                dt_x2 = max(l["x2"] for l in bar_text_lines)
                aligned_c = [
                    (bx, by, bw, bh) for (bx, by, bw, bh) in valid_c
                    if max(sx1 + bx, dt_x1) < min(sx1 + bx + bw, dt_x2)
                ]
                if aligned_c:
                    valid_c = aligned_c

            bx1 = min(b[0] for b in valid_c)
            by1 = min(b[1] for b in valid_c)
            bx2 = max(b[0] + b[2] for b in valid_c)
            by2 = max(b[1] + b[3] for b in valid_c)
            gbx1, gby1, gbx2, gby2 = sx1 + bx1, sy1 + by1, sx1 + bx2, sy1 + by2
            if symbol is not None:
                # Keep BarcodeDetector quad whole, and never let MORPH_CLOSE bleed into
                # neighboring text/borders outside the union of Gemini's box and symbol.
                ux1, uy1 = min(px1, symbol[0]), min(py1, symbol[1])
                ux2, uy2 = max(px2, symbol[2]), max(py2, symbol[3])
                gbx1 = max(ux1, min(gbx1, symbol[0]))
                gby1 = max(uy1, min(gby1, symbol[1]))
                gbx2 = min(ux2, max(gbx2, symbol[2]))
                gby2 = min(uy2, max(gby2, symbol[3]))
        else:
            gbx1, gby1, gbx2, gby2 = px1, py1, px2, py2

        if bar_text_lines:
            gbx1 = min(gbx1, min(l["x1"] for l in bar_text_lines))
            gby1 = min(gby1, min(l["y1"] for l in bar_text_lines))
            gbx2 = max(gbx2, max(l["x2"] for l in bar_text_lines))
            gby2 = max(gby2, max(l["y2"] for l in bar_text_lines))

        # Tight quiet-zone expansion: enough to avoid clipping guard bars, but never 35px into
        # adjacent white MRP boxes or neighboring text lines.
        max_pad_x = min(10, max(4, int(round(0.05 * max(1, gbx2 - gbx1)))))
        max_pad_y = min(8, max(3, int(round(0.05 * max(1, gby2 - gby1)))))

        def _strip_has_foreground(strip_gray: np.ndarray) -> bool:
            return int((strip_gray < 140).sum()) > 2

        fx1 = gbx1
        for s in range(1, max_pad_x + 1):
            x = gbx1 - s
            if x < 0:
                break
            strip = arr[gby1:gby2, x]
            if cls._get_chroma(strip) > 22 or full_gray[gby1:gby2, x].mean() < 120 or _strip_has_foreground(full_gray[gby1:gby2, x]):
                break
            fx1 = x

        fx2 = gbx2
        for s in range(1, max_pad_x + 1):
            x = gbx2 + s
            if x >= w:
                break
            strip = arr[gby1:gby2, x]
            if cls._get_chroma(strip) > 22 or full_gray[gby1:gby2, x].mean() < 120 or _strip_has_foreground(full_gray[gby1:gby2, x]):
                break
            fx2 = x

        fy1 = gby1
        for s in range(1, max_pad_y + 1):
            y = gby1 - s
            if y < 0:
                break
            strip = arr[y, fx1:fx2]
            if cls._get_chroma(strip) > 22 or full_gray[y, fx1:fx2].mean() < 120 or _strip_has_foreground(full_gray[y, fx1:fx2]):
                break
            fy1 = y

        fy2 = gby2
        for s in range(1, max_pad_y + 1):
            y = gby2 + s
            if y >= h:
                break
            strip = arr[y, fx1:fx2]
            if cls._get_chroma(strip) > 22 or full_gray[y, fx1:fx2].mean() < 120 or _strip_has_foreground(full_gray[y, fx1:fx2]):
                break
            fy2 = y

        while fy2 > gby1 + 25:
            strip = arr[fy2, fx1:fx2]
            if cls._get_chroma(strip) > 22 or full_gray[fy2, fx1:fx2].mean() < 120:
                fy2 -= 1
            else:
                break

        while fy1 < fy2 - 25:
            strip = arr[fy1, fx1:fx2]
            if cls._get_chroma(strip) > 22 or full_gray[fy1, fx1:fx2].mean() < 120:
                fy1 += 1
            else:
                break

        # If the barcode sits inside a bordered card (like a "SAMPLE BARCODE" box), snap to the card
        # border so stray neighboring glyphs just outside the border (e.g. "u") are excluded.
        bg_b = float(np.median(full_gray[fy1:fy2, fx1:fx2]))
        if bg_b >= 170 and (fx2 - fx1) > 60 and (fy2 - fy1) > 40:
            thr_b = bg_b - 30
            bh_b = fy2 - fy1
            for x in range(fx1, min(fx1 + 25, fx2 - 30)):
                if int((full_gray[fy1:fy2, x] < thr_b).sum()) >= 0.7 * bh_b and int((full_gray[fy1:fy2, x + 4] >= thr_b).sum()) >= 0.5 * bh_b:
                    fx1 = x
                    break
            for x in range(fx2 - 1, max(fx2 - 25, fx1 + 30), -1):
                if int((full_gray[fy1:fy2, x] < thr_b).sum()) >= 0.7 * bh_b and int((full_gray[fy1:fy2, x - 4] >= thr_b).sum()) >= 0.5 * bh_b:
                    fx2 = x + 1
                    break
            bw_b = fx2 - fx1
            for y in range(fy1, min(fy1 + 15, fy2 - 25)):
                if int((full_gray[y, fx1:fx2] < thr_b).sum()) >= 0.7 * bw_b and int((full_gray[y + 4, fx1:fx2] >= thr_b).sum()) >= 0.5 * bw_b:
                    fy1 = y
                    break
            for y in range(fy2 - 1, max(fy2 - 15, fy1 + 25), -1):
                if int((full_gray[y, fx1:fx2] < thr_b).sum()) >= 0.7 * bw_b and int((full_gray[y - 4, fx1:fx2] >= thr_b).sum()) >= 0.5 * bw_b:
                    fy2 = y + 1
                    break

        return cls._even_frame_margins(arr, (fx1, fy1, fx2, fy2))

    @classmethod
    def _find_clean_boundary_y(
        cls,
        gray: np.ndarray,
        x1: int,
        x2: int,
        y_anchor: int,
        min_allowed_y: int,
        max_allowed_y: int,
        ocr_lines: Optional[List[Dict[str, Any]]] = None,
    ) -> int:
        """
        Dynamically finds the row with minimum edge activity strictly bounded by [min_allowed_y, max_allowed_y].
        Enforces the Zero-Slicing Invariant: Never picks a row that cuts through any detected OCR text line.
        """
        h = gray.shape[0]
        y_min = max(0, min(min_allowed_y, max_allowed_y))
        y_max = min(h - 1, max(min_allowed_y, max_allowed_y))
        if y_max <= y_min:
            return y_min

        sx1 = max(0, min(x1, gray.shape[1] - 1))
        sx2 = max(0, min(x2, gray.shape[1]))
        if sx2 <= sx1:
            return y_anchor

        sub = gray[y_min:y_max + 1, sx1:sx2]
        if sub.size == 0:
            return y_anchor

        sob_y = cv2.Sobel(sub, cv2.CV_64F, 0, 1, ksize=3)
        grad_mag = np.mean(np.abs(sob_y), axis=1)
        row_var = np.var(sub, axis=1)
        metric = grad_mag + 0.1 * np.sqrt(row_var)

        if ocr_lines:
            for idx in range(len(metric)):
                row_y = y_min + idx
                for l in ocr_lines:
                    if max(sx1, l["x1"]) < min(sx2, l["x2"]):
                        if l["y1"] <= row_y <= l["y2"]:
                            metric[idx] += 10000.0
                            break

        dist_from_anchor = np.abs(np.arange(y_min, y_max + 1) - y_anchor)
        metric += 0.05 * dist_from_anchor

        best_idx = int(np.argmin(metric))
        return y_min + best_idx

    @classmethod
    def _extract_ocr_lines(cls, arr: np.ndarray) -> List[Dict[str, Any]]:
        """Extracts cleaned bounding boxes and text from the image for boundary refinement."""
        lines = []
        try:
            raw_ocr = read_text(arr)
            for bbox, text, conf in raw_ocr:
                if conf < 0.20:
                    continue
                tl, tr, br, bl = bbox
                c_text = text.strip()
                if not c_text:
                    continue
                lines.append({
                    "x1": int(min(tl[0], bl[0])),
                    "y1": int(min(tl[1], tr[1])),
                    "x2": int(max(tr[0], br[0])),
                    "y2": int(max(bl[1], br[1])),
                    "text": c_text,
                    "conf": conf,
                })
        except Exception as err:
            logger.debug(f"Optional OCR line extraction skipped: {err}")
        return lines

    @classmethod
    def _refine_text_block_box(
        cls,
        box: Tuple[int, int, int, int],
        ocr_lines: List[Dict[str, Any]],
        other_boxes: List[Tuple[int, int, int, int]],
        gray: Optional[np.ndarray] = None,
        tighten_x: bool = False,
        color: Optional[np.ndarray] = None,
    ) -> Optional[Tuple[int, int, int, int]]:
        """
        Geometry-only refinement of a text-block crop (no keywords, no pack-specific values).

        1. Ownership: an OCR line belongs to this region if (almost) all of it lies inside Gemini's box and it is
           not claimed by a smaller, more specific region inside this one (e.g. an FSSAI mark overlapping a
           manufacturer box).
        2. Growth: an unclaimed line that Gemini's edge cut through (partly inside) and that directly adjoins the
           block (gap well under one line height, same column) is pulled in whole.
        3. Extent: Gemini's box is kept for non-text graphics (logos, QR frame) but is cut in the middle of the gap
           before the nearest foreign text line above / below the block, so neither a neighbour's text nor this
           block's own text is sliced. Foreign lines beside the block (same rows) never clamp it, so a logo or
           licence mark next to an address is harmless.
        """
        px1, py1, px2, py2 = box

        def frac_inside(l: Dict[str, Any], b: Tuple[int, int, int, int]) -> float:
            ix = max(0, min(l["x2"], b[2]) - max(l["x1"], b[0]))
            iy = max(0, min(l["y2"], b[3]) - max(l["y1"], b[1]))
            area = max(1, (l["x2"] - l["x1"]) * (l["y2"] - l["y1"]))
            return ix * iy / area

        def area(b: Tuple[int, int, int, int]) -> int:
            return max(0, b[2] - b[0]) * max(0, b[3] - b[1])

        def v_frac(l: Dict[str, Any], b: Tuple[int, int, int, int]) -> float:
            return max(0, min(l["y2"], b[3]) - max(l["y1"], b[1])) / max(1, l["y2"] - l["y1"])

        def h_frac(l: Dict[str, Any], b: Tuple[int, int, int, int]) -> float:
            return max(0, min(l["x2"], b[2]) - max(l["x1"], b[0])) / max(1, l["x2"] - l["x1"])

        smaller = [b for b in other_boxes if area(b) < area(box)]
        own: List[Dict[str, Any]] = []
        foreign: List[Dict[str, Any]] = []
        for l in ocr_lines:
            # Rows inside the box and a real share of the line horizontally inside: Gemini's side edge may cut a
            # long line (e.g. a wide licence line under a narrow logo box); the line is still ours, kept whole.
            covered = v_frac(l, box) >= 0.7 and h_frac(l, box) >= 0.4
            if covered and not any(frac_inside(l, b) >= 0.5 for b in smaller):
                own.append(l)
            else:
                foreign.append(l)
        if not own:
            return None

        heights = sorted(l["y2"] - l["y1"] for l in own)
        line_h = max(8, heights[len(heights) // 2])

        def same_column(l: Dict[str, Any], x1: int, x2: int) -> bool:
            return min(x2, l["x2"]) - max(x1, l["x1"]) > 0.3 * min(x2 - x1, l["x2"] - l["x1"])

        # Split: if another region's text sits between two groups of our lines (Gemini's box over-extended past a
        # neighbouring section), keep only the largest group, ties to the top-most.
        own.sort(key=lambda l: l["y1"])
        groups: List[List[Dict[str, Any]]] = [[own[0]]]
        for l in own[1:]:
            prev_bottom = max(x["y2"] for x in groups[-1])
            blocked = any(
                prev_bottom - 2 <= (f["y1"] + f["y2"]) / 2 <= l["y1"] + 2 and same_column(f, l["x1"], l["x2"])
                for f in foreign
            )
            if l["y1"] - prev_bottom > 1.5 * line_h and blocked:
                groups.append([l])
            else:
                groups[-1].append(l)
        if len(groups) > 1:
            kept = max(groups, key=lambda g: (len(g), -g[0]["y1"]))
            foreign.extend(l for l in own if l not in kept)
            own = kept

        # Only lines that Gemini's edge actually cut through (partly inside the box) may be adopted; lines wholly
        # outside belong to whatever follows (another section, or text beyond a card border).
        free = [
            l for l in foreign
            if 0 < frac_inside(l, box) < 0.7 and v_frac(l, box) >= 0.5
            and not any(frac_inside(l, b) >= 0.5 for b in smaller)
        ]
        grew = True
        while grew:
            grew = False
            bx1, bx2 = min(l["x1"] for l in own), max(l["x2"] for l in own)
            by1, by2 = min(l["y1"] for l in own), max(l["y2"] for l in own)
            for l in list(free):
                row_mate = any(
                    min(l["y2"], o["y2"]) - max(l["y1"], o["y1"]) >= 0.5 * min(l["y2"] - l["y1"], o["y2"] - o["y1"])
                    and max(l["x1"] - o["x2"], o["x1"] - l["x2"]) <= 3 * line_h
                    for o in own
                )
                if row_mate:
                    own.append(l)
                    free.remove(l)
                    foreign.remove(l)
                    grew = True
                    continue
                if not same_column(l, bx1, bx2):
                    continue
                below_block = l["y1"] >= by2 - 0.25 * line_h
                above_block = l["y2"] <= by1 + 0.25 * line_h
                gap = (l["y1"] - by2) if below_block else (by1 - l["y2"])
                if (below_block or above_block) and gap <= 0.25 * line_h:
                    own.append(l)
                    free.remove(l)
                    foreign.remove(l)
                    grew = True

        ox1, ox2 = min(l["x1"] for l in own), max(l["x2"] for l in own)
        first = min(own, key=lambda l: l["y1"])
        last = max(own, key=lambda l: l["y2"])
        oy1, oy2 = first["y1"], last["y2"]
        first_cy, last_cy = (first["y1"] + first["y2"]) / 2, (last["y1"] + last["y2"]) / 2

        above = [l for l in foreign if (l["y1"] + l["y2"]) / 2 < first_cy and same_column(l, ox1, ox2)]
        below = [l for l in foreign if (l["y1"] + l["y2"]) / 2 > last_cy and same_column(l, ox1, ox2)]

        ny1, ny2 = min(py1, oy1), max(py2, oy2)
        top_limit, bottom_limit = 0, (gray.shape[0] if gray is not None else max(py2, oy2))
        if above:
            nearest = max(above, key=lambda l: l["y2"])
            top_limit = (nearest["y2"] + oy1) // 2
            ny1 = max(ny1, top_limit)
        if below:
            nearest = min(below, key=lambda l: l["y1"])
            bottom_limit = (oy2 + nearest["y1"]) // 2 + 1
            ny2 = min(ny2, bottom_limit)
        ny1, ny2 = min(ny1, oy1 + line_h // 4), max(ny2, oy2 - line_h // 4)

        # Snap to a physical table / box border right next to the text, as long as it stays inside the limits set
        # by the neighbouring text, so a frame is kept whole instead of being cut through.
        has_hframe = False
        if gray is not None:
            def _is_color_seam(y_line: int) -> bool:
                if color is None or y_line < 4 or y_line + 5 >= color.shape[0]:
                    return False
                above_strip = color[y_line - 4:y_line - 1, ox1:ox2].astype(np.float32)
                below_strip = color[y_line + 2:y_line + 5, ox1:ox2].astype(np.float32)
                if above_strip.size == 0 or below_strip.size == 0:
                    return False
                mean_diff = float(np.linalg.norm(above_strip.mean(axis=(0, 1)) - below_strip.mean(axis=(0, 1))))
                return mean_diff > 45.0

            reach = int(1.5 * line_h)
            top_rule = cls._find_horizontal_line(gray, ox1, ox2, oy1, search_range=(-reach, 0))
            if top_rule is not None and top_limit <= top_rule - 3 < oy1 and not _is_color_seam(top_rule):
                ny1 = min(ny1, top_rule - 3)
                has_hframe = True
            bot_rule = cls._find_horizontal_line(gray, ox1, ox2, oy2, search_range=(0, reach))
            if bot_rule is not None and oy2 < bot_rule + 3 <= bottom_limit and not _is_color_seam(bot_rule):
                ny2 = max(ny2, bot_rule + 3)
                has_hframe = True

        if tighten_x:
            margin = max(4, line_h // 2)
            px1, px2 = max(px1, ox1 - margin), min(px2, ox2 + margin)
        # Never slice one of our own lines sideways (Gemini's left/right edge can cut through a line). OCR boxes
        # can stop short of the first / last glyph, so keep a small margin, but never past the midpoint to text in
        # a neighbouring column on the same rows.
        side = [l for l in foreign if l["y2"] > ny1 and l["y1"] < ny2]
        left_text = [l["x2"] for l in side if l["x2"] <= ox1]
        right_text = [l["x1"] for l in side if l["x1"] >= ox2]
        img_w = gray.shape[1] if gray is not None else max(px2, ox2)
        left_limit = (max(left_text) + ox1) // 2 if left_text else 0
        right_limit = (min(right_text) + ox2) // 2 if right_text else img_w
        pad = max(4, line_h // 3)
        px1 = min(px1, max(left_limit, ox1 - pad))
        px2 = max(px2, min(right_limit, ox2 + pad))

        # Keep a vertical table / card border just outside the text whole (same idea as the horizontal rules), but
        # only when the crop also holds that frame's top or bottom edge. A one-line crop out of a bordered card
        # would otherwise show a lone vertical bar.
        if gray is not None and has_hframe:
            reach = int(1.5 * line_h)
            left_rule = cls._find_vertical_line(gray, ny1, ny2, ox1, search_range=(-reach, 0))
            if left_rule is not None and left_limit <= left_rule - 1 < ox1:
                px1 = min(px1, left_rule - 1)
            right_rule = cls._find_vertical_line(gray, ny1, ny2, ox2, search_range=(0, reach))
            if right_rule is not None and ox2 < right_rule + 1 <= right_limit:
                px2 = max(px2, right_rule + 1)
        px1, px2 = max(0, px1), min(img_w, px2)

        # Drop outer columns that are packaging rather than this block's own background: the block background is
        # the median colour around its text; a column belongs to the block when most of it is that colour or dark
        # ink / border line. Columns are only trimmed from the outside in and never past the text, so logos or
        # frames inside the block are untouched.
        if color is not None and color.ndim == 3 and ny2 > ny1:
            band = color[max(0, oy1):max(oy1 + 1, oy2), max(0, ox1):max(ox1 + 1, ox2), :3].reshape(-1, 3).astype(float)
            if band.size:
                bg = np.median(band, axis=0)
                bg_chroma = float(bg.max() - bg.min())

                def col_ok(x: int) -> bool:
                    col = color[ny1:ny2, x, :3].astype(float)
                    if col.size == 0:
                        return True
                    # background-like: close to the block colour AND not more colourful than it (a faint packaging
                    # tint on a white card is close in distance but clearly more saturated)
                    pix_chroma = col.max(axis=1) - col.min(axis=1)
                    near_bg = (np.linalg.norm(col - bg, axis=1) < 45) & (pix_chroma < bg_chroma + 20)
                    dark = col.mean(axis=1) < 100
                    # outside the text there should be nothing but background or a frame line; a column that is
                    # packaging colour in even part of its height (e.g. the bag edge at one corner) is trimmed
                    return float(np.mean(near_bg | dark)) >= 0.9

                def run_ok(xs: List[int]) -> bool:
                    return all(0 <= x < color.shape[1] and col_ok(x) for x in xs)

                x = px1
                while x < ox1 - 2 and not run_ok([x, x + 1, x + 2]):
                    x += 1
                px1 = x
                x = px2 - 1
                while x > ox2 + 2 and not run_ok([x, x - 1, x - 2]):
                    x -= 1
                px2 = x + 1

                # A thin frame line just outside the trimmed edge is part of the block: keep it. It must be clearly
                # darker than the block background and colourless (grey/black), so coloured packaging never counts.
                bg_lum = float(bg.mean())
                k = max(3, line_h // 4)

                def is_frame(xc: int) -> bool:
                    if not (0 <= xc < color.shape[1]):
                        return False
                    col = color[ny1:ny2, xc, :3].astype(float)
                    if col.size == 0 or cls._get_chroma(col) >= 30:
                        return False
                    # an unbroken vertical line: darker than the background in (almost) every row. Glyph strokes
                    # never span the full height of the crop, so first letters are not mistaken for a frame.
                    return float(np.mean(col.mean(axis=1) < bg_lum - 40)) >= 0.85

                if has_hframe:
                    left = [xc for xc in range(px1 - 1, px1 - 1 - k, -1) if is_frame(xc)]
                    if left:
                        px1 = max(0, min(left) - 1)
                    right = [xc for xc in range(px2, px2 + k) if is_frame(xc)]
                    if right:
                        px2 = min(color.shape[1], max(right) + 2)
                else:
                    # No horizontal frame edge in the crop: a vertical bar between the edge and the text is a piece
                    # of a larger box, so start the crop just inside it.
                    left = [xc for xc in range(px1, ox1 - 2) if is_frame(xc)]
                    if left:
                        px1 = max(left) + 2
                    right = [xc for xc in range(ox2 + 3, px2) if is_frame(xc)]
                    if right:
                        px2 = min(right) - 1

        if ny2 <= ny1 + 10:
            return None
        return (px1, ny1, px2, ny2)

    @staticmethod
    def _longest_run(mask_1d: np.ndarray, max_gap: int = 3) -> int:
        """Longest run of True values in a 1-D mask, bridging gaps of up to max_gap pixels."""
        best = cur = gap = 0
        for v in mask_1d:
            if v:
                cur += gap + 1
                gap = 0
            elif cur:
                gap += 1
                if gap > max_gap:
                    best, cur, gap = max(best, cur), 0, 0
        return max(best, cur)

    @classmethod
    def _even_frame_margins(
        cls, arr: np.ndarray, box: Tuple[int, int, int, int]
    ) -> Tuple[int, int, int, int]:
        """When a crop is enclosed by a thin frame on all four sides (a bordered table or panel), re-centre
        it so the frame gets the same small margin on every side. The refine steps above move each edge
        independently, which can leave a wide strip of card outside one border and none outside the other.
        Crops without a complete frame are returned unchanged; margins only grow into clean background."""
        h, w = arr.shape[:2]
        x1, y1, x2, y2 = box
        bw, bh = x2 - x1, y2 - y1
        if bw < 60 or bh < 40:
            return box
        gray = cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2GRAY) if arr.ndim == 3 else arr
        bg = float(np.median(gray[y1:y2, x1:x2]))
        if bg < 170:
            return box  # dark panel: border lines are not darker than the background
        dark_thr, light_thr = bg - 30, bg - 15
        max_thick = 6

        band = 3  # tolerate slightly slanted (photographed) border lines

        def find_line(vertical: bool, from_start: bool) -> Optional[int]:
            """Outer edge of the frame line on one side, in image coordinates, or None."""
            length, (s0, s1) = (bh, (y1, y2)) if vertical else (bw, (x1, x2))
            limit = w if vertical else h
            win = max(20, int(0.08 * (bw if vertical else bh)))
            lo, hi = (x1, x2 - 1) if vertical else (y1, y2 - 1)
            inward = 1 if from_start else -1
            # Start at the crop edge: a line outside the crop belongs to a neighbouring box.
            start = lo if from_start else hi

            def line_mean(q: int) -> float:
                strip = gray[s0:s1, q] if vertical else gray[q, s0:s1]
                return float(strip.mean())

            def is_line(q: int) -> bool:
                qs = [q + inward * k for k in range(band)]
                if not all(0 <= v < limit for v in qs):
                    return False
                if vertical:
                    stack = gray[s0:s1, min(qs):max(qs) + 1].min(axis=1)
                else:
                    stack = gray[min(qs):max(qs) + 1, s0:s1].min(axis=0)
                return cls._longest_run(stack < dark_thr) >= 0.6 * length

            def light_near(q: int, step: int) -> bool:
                vals = [line_mean(q + step * k) for k in range(1, 5) if 0 <= q + step * k < limit]
                return bool(vals) and max(vals) > light_thr

            end = start + inward * win
            q = start - inward
            while True:
                q += inward
                if (q - end) * inward >= 0:
                    return None
                if not 0 <= q < limit or not is_line(q):
                    continue
                q0 = q
                # Snap to the first visibly darker pixel in the band, then take in faint slant pixels.
                k = 0
                while k < band - 1 and line_mean(q) >= bg - 5:
                    q += inward
                    k += 1
                k = 0
                while k < 4 and 0 <= q - inward < limit and line_mean(q - inward) < bg - 5:
                    q -= inward
                    k += 1
                r = q
                while abs(r - q) <= max_thick + band and 0 <= r + inward < limit and line_mean(r + inward) < light_thr:
                    r += inward
                if abs(r - q) > max_thick + band or not light_near(q, -inward) or not light_near(r, inward):
                    # Not a thin line on plain background (e.g. the packaging edge outside the card): skip past it.
                    q = max(q0, r) if inward > 0 else min(q0, r)
                    continue
                return q

        left, right = find_line(True, True), find_line(True, False)
        top, bottom = find_line(False, True), find_line(False, False)
        if None in (left, right, top, bottom) or right - left < 40 or bottom - top < 25:
            return box

        target = max(4, int(round(0.015 * max(bw, bh))))

        def clean_room(vertical: bool, start: int, step: int) -> int:
            """How many pixels outward from the frame line stay plain, neutral background (up to target)."""
            n = 0
            for i in range(1, target + 1):
                p = start + step * i
                if not 0 <= p < (w if vertical else h):
                    break
                strip = arr[top:bottom + 1, p] if vertical else arr[p, left:right + 1]
                g = gray[top:bottom + 1, p] if vertical else gray[p, left:right + 1]
                if float(g.mean()) < light_thr or float(g.std()) > 12 or cls._get_chroma(strip) > 22:
                    break
                n = i
            return n

        m = min(
            target,
            clean_room(True, left, -1), clean_room(True, right, 1),
            clean_room(False, top, -1), clean_room(False, bottom, 1),
        )
        return (max(0, left - m), max(0, top - m), min(w, right + 1 + m), min(h, bottom + 1 + m))

    @classmethod
    def _trim_edge_lines(
        cls, arr: np.ndarray, box: Tuple[int, int, int, int]
    ) -> Tuple[int, int, int, int]:
        """Removes a thin rule caught at a crop edge that belongs to a neighbouring box: a line touching the
        edge, separated from the crop's content by a clean gap, whose ends do not run back into the crop
        (so it is not this region's own frame). Example: the top border of the next panel showing as a
        sliver under an address block."""
        h, w = arr.shape[:2]
        x1, y1, x2, y2 = box
        gray = cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2GRAY) if arr.ndim == 3 else arr
        sub = gray[y1:y2, x1:x2]
        if sub.shape[0] < 30 or sub.shape[1] < 30:
            return box
        bg = float(np.median(sub))
        if bg < 170:
            return box
        dark_thr, light_thr = bg - 30, bg - 15

        def trim(lines: np.ndarray) -> int:
            """lines: 2-D array whose rows run from the crop edge inward. Returns how many rows to drop."""
            n, span = lines.shape
            depth = min(n // 3, max(8, int(round(0.06 * n))))
            dark = lines < dark_thr
            is_line = [cls._longest_run(dark[i]) >= 0.5 * span for i in range(depth)]
            # The line group must touch the edge (within 2 rows) and be thin.
            first = next((i for i in range(min(3, depth)) if is_line[i]), None)
            if first is None:
                return 0
            last = first
            while last + 1 < depth and is_line[last + 1]:
                last += 1
            def light(i: int) -> bool:
                return float(lines[i].mean()) > light_thr and cls._longest_run(dark[i]) < 0.1 * span

            # Anti-aliased rows next to the line belong to it.
            while last + 1 < depth and last - first < 6 and not light(last + 1):
                last += 1
            if last - first + 1 > 6:
                return 0
            gap = 0
            for i in range(last + 1, depth):
                if light(i):
                    gap += 1
                else:
                    break
            if gap < 2:
                return 0
            # The line's ends must not continue into the crop (that would be this region's own frame).
            cols = np.where(dark[first:last + 1].any(axis=0))[0]
            if cols.size == 0:
                return 0
            # Checked in the rows right after the line, a little wider than its ends, because a rounded
            # corner curves sideways as it turns.
            near = dark[last + 1:last + 1 + min(3, gap)]
            for c in (cols.min(), cols.max()):
                if near[:, max(0, c - 6):min(span, c + 7)].any():
                    return 0
            return last + 1

        top = trim(sub)
        bottom = trim(sub[::-1])
        left = trim(sub.T)
        right = trim(sub.T[::-1])
        nx1, ny1, nx2, ny2 = x1 + left, y1 + top, x2 - right, y2 - bottom
        if nx2 - nx1 < 35 or ny2 - ny1 < 25:
            return box
        return (nx1, ny1, nx2, ny2)

    @classmethod
    def validate_and_refine_crop_box(
        cls,
        box: Any,
        cat: str,
        orig_w: int,
        orig_h: int,
        all_regions: Optional[List[Dict[str, Any]]] = None,
        arr: Optional[np.ndarray] = None,
        ocr_lines: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[Tuple[int, int, int, int]]:
        """
        Rigorous 'Check Before Crop' dynamic coordinate verification and adaptive boundary refinement.
        1. Validates normalized coordinate bounds [0 <= ymin < ymax <= 1000, 0 <= xmin < xmax <= 1000].
        2. Rejects degenerate or inverted bounding boxes.
        3. Enforces the Zero-Slicing Invariant: Never cuts through text lines, wordmarks, emblems, or footnotes.
        4. Dynamically clamps to container cards/panels using chromaticity and background color gradients,
           preventing white slivers and outer background bleeding across arbitrary packaging designs.
        5. Returns clamped pixel coordinates (fx1, fy1, fx2, fy2) or None if invalid.
        """
        if not box or not isinstance(box, (list, tuple)) or len(box) != 4:
            logger.warning(f"Invalid coordinate format for category {cat}: {box}")
            return None

        try:
            ymin, xmin, ymax, xmax = [float(v) for v in box]
        except (ValueError, TypeError):
            logger.warning(f"Non-numeric coordinates for category {cat}: {box}")
            return None

        if not (0 <= ymin < ymax <= 1000 and 0 <= xmin < xmax <= 1000):
            logger.warning(f"Coordinates out of bounds [0, 1000] for category {cat}: {box}")
            return None

        if (ymax - ymin) < 8 or (xmax - xmin) < 8:
            logger.warning(f"Degenerate box dimensions for category {cat}: {box}")
            return None

        py1 = int(round(ymin * orig_h / 1000.0))
        px1 = int(round(xmin * orig_w / 1000.0))
        py2 = int(round(ymax * orig_h / 1000.0))
        px2 = int(round(xmax * orig_w / 1000.0))

        cat_lower = cat.lower().strip()
        gray = cv2.cvtColor(arr[:, :, :3], cv2.COLOR_BGR2GRAY) if (arr is not None and arr.ndim >= 2) else None

        if cat_lower == "barcode" and arr is not None:
            return cls._refine_barcode_boundary(arr, px1, py1, px2, py2, ocr_lines=ocr_lines)

        # Pixel boxes of every OTHER Gemini region (used to decide which OCR lines belong to this one).
        other_boxes_px: List[Tuple[int, int, int, int]] = []
        for other_reg in (all_regions or []):
            if (other_reg.get("region_type") or "").lower().strip() == cat_lower or not other_reg.get("box_2d"):
                continue
            try:
                a, b, c, d = [float(v) for v in other_reg["box_2d"]]
                other_boxes_px.append((
                    int(round(b * orig_w / 1000.0)), int(round(a * orig_h / 1000.0)),
                    int(round(d * orig_w / 1000.0)), int(round(c * orig_h / 1000.0)),
                ))
            except Exception:
                continue
        block_refined = False

        if ocr_lines:
            if cat_lower in ("fssai", "nutritional", "ingredient", "manufactured_by"):
                # Fully geometric, no keywords: see _refine_text_block_box.
                refined = cls._refine_text_block_box(
                    (px1, py1, px2, py2), ocr_lines, other_boxes_px,
                    gray=gray, tighten_x=(cat_lower == "ingredient"), color=arr,
                )
                if refined:
                    rx1, ry1, rx2, ry2 = refined
                    if cat_lower == "fssai":
                        # FSSAI is a compact emblem+license block; keep outward expansion tight unless
                        # a 14-digit Lic. No. line sits directly below an emblem-only Gemini box.
                        has_lic_inside = any(
                            re.search(r'\b\d{14}\b|lic', l["text"].lower())
                            for l in ocr_lines
                            if l["x2"] > px1 and l["x1"] < px2 and l["y2"] > py1 and l["y1"] < py2
                        )
                        extra_down = 15 if has_lic_inside else 45
                        refined = (
                            max(rx1, px1 - 20),
                            max(ry1, py1 - 15),
                            min(rx2, px2 + 20),
                            min(ry2, py2 + extra_down),
                        )
                    else:
                        # Proportional expansion budget for nutritional, ingredient, manufactured_by
                        pad_x = max(24, int(round(0.15 * max(1, px2 - px1))))
                        pad_y = max(24, int(round(0.15 * max(1, py2 - py1))))
                        refined = (
                            max(rx1, px1 - pad_x),
                            max(ry1, py1 - pad_y),
                            min(rx2, px2 + pad_x),
                            min(ry2, py2 + pad_y),
                        )
                    px1, py1, px2, py2 = refined
                    block_refined = True

                    if cat_lower == "manufactured_by":
                        box_text = " ".join(
                            l["text"].lower() for l in ocr_lines
                            if l["x2"] > px1 and l["x1"] < px2 and l["y2"] > py1 and l["y1"] < py2
                        )
                        has_entity_cue = bool(re.search(
                            r'manufactur|marketed|packed|imported|distribut|consumer\s*care|customer\s*care|'
                            r'pvt|ltd|llp|limited|inc\.|corp\.|@|www\.|email|ph\.|tel\.|toll\s*free|'
                            r'road|street|sector|plot|survey|dist\.|india|pin\s*[:\-]?\s*\d{6}',
                            box_text,
                        ))
                        if box_text and not has_entity_cue:
                            logger.info(f"Rejecting false-positive manufactured_by crop (no entity/contact text): {box_text[:120]}")
                            return None

        if all_regions and not block_refined:
            for other_reg in all_regions:
                other_type = (other_reg.get("region_type") or "").lower().strip()
                if other_type == cat_lower or not other_reg.get("box_2d"):
                    continue
                try:
                    oy1, ox1, oy2, ox2 = [float(v) for v in other_reg["box_2d"]]
                    opy1 = int(round(oy1 * orig_h / 1000.0))
                    opx1 = int(round(ox1 * orig_w / 1000.0))
                    opy2 = int(round(oy2 * orig_h / 1000.0))
                    opx2 = int(round(ox2 * orig_w / 1000.0))
                except Exception:
                    continue

                if max(px1, opx1) < min(px2, opx2):
                    if 0 < opy2 - py1 < 35 and opy1 < py1:
                        if other_type in ("storage", "nutritional"):
                            py1 = max(py1, opy2 + 2)
                    elif 0 < py2 - opy1 < 35 and opy2 > py2:
                        if other_type in ("ingredient", "barcode"):
                            py2 = min(py2, opy1 - 2)
                    elif py1 < opy1 < py2:
                        if other_type in ("ingredient", "barcode"):
                            py2 = min(py2, opy1 - 2)

        if py2 <= py1 + 10:
            py2 = py1 + 20

        if arr is not None and not block_refined:
            fx1, fx2 = cls._clamp_to_panel_or_card(arr, px1, py1, px2, py2)
        else:
            fx1, fx2 = px1, px2

        fy1, fy2 = py1, py2

        if arr is not None:
            # Drop a neighbouring box's border caught at an edge first, so it is not mistaken for this
            # region's own frame; then even out the margins around the frame (if the region has one).
            fx1, fy1, fx2, fy2 = cls._trim_edge_lines(arr, (fx1, fy1, fx2, fy2))
            fx1, fy1, fx2, fy2 = cls._even_frame_margins(arr, (fx1, fy1, fx2, fy2))

        final_w = fx2 - fx1
        final_h = fy2 - fy1
        if final_w < 35 or final_h < 25:
            logger.warning(f"Refined crop box too small ({final_w}x{final_h}) for category {cat}")
            return None

        return (fx1, fy1, fx2, fy2)

    @classmethod
    def detect_and_extract_sub_regions(
        cls,
        image_bytes: bytes,
        bbid: str,
        category: str,
        canvas_width: int,
        canvas_height: int,
        dpi: int,
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
                ocr_lines = cls._extract_ocr_lines(arr)
                for reg in sorted_regions:
                    cat = (reg.get("region_type") or "").lower().strip()
                    disp = reg.get("display_name") or cat.replace("_", " ").title()
                    box = reg.get("box_2d")
                    refined_coords = cls.validate_and_refine_crop_box(
                        box=box,
                        cat=cat,
                        orig_w=orig_w,
                        orig_h=orig_h,
                        all_regions=gemini_regions,
                        arr=arr,
                        ocr_lines=ocr_lines,
                    )
                    try:
                        gy1, gx1, gy2, gx2 = [float(v) for v in box]
                        raw_px = (
                            round(gx1 * orig_w / 1000), round(gy1 * orig_h / 1000),
                            round(gx2 * orig_w / 1000), round(gy2 * orig_h / 1000),
                        )
                    except Exception:
                        raw_px = None
                    logger.info(
                        f"[SubRegion] {bbid} {cat}: image={orig_w}x{orig_h} gemini_box_2d={box} "
                        f"gemini_px(x1,y1,x2,y2)={raw_px} refined_px={refined_coords}"
                    )
                    if not refined_coords:
                        continue

                    fx1, fy1, fx2, fy2 = refined_coords
                    crop = arr[fy1:fy2, fx1:fx2]
                    if crop.shape[0] >= 20 and crop.shape[1] >= 30:
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
                    # Include multi-line statutory licenses (e.g. Mfg by / Mktd by Lic. No. lines below primary license)
                    near_below = 0 <= l["y1"] - lic["y2"] <= 3 * line_h
                    if l is not lic and near_below and overlaps and (
                        bool(re.search(r"(?<!\d)\d{14}(?!\d)", l["text"].replace(" ", "")))
                        or any(k in l["text"].lower() for k in ["lic", "mfg by", "mktd by", "license"])
                    ):
                        fssai_group.append(l)
                sections.append(("fssai", "FSSAI", fssai_group))



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

                return cls._refine_barcode_boundary(arr, fx1, fy1, fx2, fy2, ocr_lines=text_lines)
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
                    return cls._refine_barcode_boundary(arr, fx1, fy1, fx2, fy2, ocr_lines=text_lines)
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
        if category == "barcode" and crop_img.height > crop_img.width * 1.2:
            # Auto-orient vertical barcodes to horizontal: pick the 90-degree rotation that puts
            # the denser zebra-bar half on top and the lighter human-readable digits at the bottom.
            g = cv2.cvtColor(crop_arr, cv2.COLOR_RGB2GRAY) if crop_arr.ndim == 3 else crop_arr
            dark = (g < 128).astype(np.float32)
            mid_x = max(1, dark.shape[1] // 2)
            left_density = float(dark[:, :mid_x].mean())
            right_density = float(dark[:, mid_x:].mean())
            transpose_op = Image.Transpose.ROTATE_90 if left_density >= right_density else Image.Transpose.ROTATE_270
            crop_img = crop_img.transpose(transpose_op)

        canvas_bytes = cls._fit_to_standard_canvas(
            crop_img,
            target_w=canvas_w,
            target_h=canvas_h,
            dpi=dpi,
            category=category,
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
        target_w: int,
        target_h: int,
        dpi: int,
        category: str = "",
    ) -> bytes:
        crop_rgba = crop_img.convert("RGBA")
        cw, ch = crop_rgba.size

        if category == "barcode" and max(cw, ch) < 350:
            # Boost bar/digit separation slightly on tiny barcodes before 6x-10x upscaling.
            rgb = crop_rgba.convert("RGB")
            rgb = ImageEnhance.Contrast(rgb).enhance(1.15)
            crop_rgba = rgb.convert("RGBA")

        # Table 3: information panels use 0 px padding and fill the canvas edge-to-edge. Scale without
        # distortion so the panel touches the canvas on its long side.
        # A 10 px margin each side, whatever the canvas size.
        target_span_w = max(1, target_w - 20)
        target_span_h = max(1, target_h - 20)
        scale = min(target_span_w / cw, target_span_h / ch)
        scaled_w = min(target_w, max(1, round(cw * scale)))
        scaled_h = min(target_h, max(1, round(ch * scale)))

        scaled_img = crop_rgba.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
        if max(cw, ch) < 500:
            # Small crops upscaled >4x to 2000px look soft with LANCZOS alone; apply light unsharp masking.
            scaled_img = scaled_img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=120, threshold=3))

        # The rest of the canvas is transparent, never a colour (matches the manual reference outputs).
        canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        offset_x = (target_w - scaled_w) // 2
        offset_y = (target_h - scaled_h) // 2
        canvas.paste(scaled_img, (offset_x, offset_y), scaled_img)

        buf = io.BytesIO()
        canvas.save(buf, format="PNG", dpi=(dpi, dpi))
        return buf.getvalue()
