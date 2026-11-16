"""
Dynamic Color-Adaptive MRP, Expiry Date & Batch Code Inpainting Service.
Adheres strictly to BigBasket SRS Section 5: MRP and Expiry Information Removal.
Features surgical text-stroke masking, boundary gradient sampling, Telea diffusion,
and micro-texture synthesis to perfectly match any packaging color, material, or gradient.
"""

import io
import logging
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


class DynamicInpaintService:
    """
    Advanced inpainting engine for removing variable retail stamps
    (MRP, Unit Sale Price, Expiry Date, Mfg Date, Batch Code) from packaging
    while preserving 100% of the surrounding packaging color, texture, and text.
    """

    @classmethod
    def detect_and_inpaint_stamps(
        cls,
        image_bytes: Any,
        bbid: str = "",
        filename: str = "",
        category: str = "FOOD",
        neighbor_exclusion_boxes: Optional[List[List[int]]] = None,
        batch_id: Optional[int] = None,
        image_id: Optional[int] = None,
        status_out: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bytes, bool, List[Dict[str, Any]]]:
        """
        Executes dynamic Gemini stamp localization followed by surgical color-adaptive inpainting.
        Returns:
            (processed_png_bytes, inpaint_applied_bool, list_of_removed_stamps)
        If status_out is given, status_out["detection_ok"] tells whether Gemini actually answered (True) or the
        call failed / was not configured (False), so callers can tell "no stamps" from "could not check".
        """
        from pathlib import Path
        if isinstance(image_bytes, (str, Path)):
            if not filename:
                filename = Path(image_bytes).name
            image_bytes = Path(image_bytes).read_bytes()

        from app.services.bigbasket.gemini_service import GeminiClassificationService

        # 1. Ask Gemini Vision AI to semantically locate all variable price and date stamps
        stamp_data = GeminiClassificationService.detect_mrp_expiry_stamps(
            image_bytes=image_bytes,
            bbid=bbid,
            filename=filename,
            category=category,
            batch_id=batch_id,
            image_id=image_id,
        )

        if status_out is not None:
            status_out["detection_ok"] = bool(stamp_data.get("detection_ok", True))

        stamps = stamp_data.get("stamps", [])
        if not stamps or not stamp_data.get("has_removable_stamps"):
            return image_bytes, False, []

        orig_img = Image.open(io.BytesIO(image_bytes))
        has_alpha = orig_img.mode in ("RGBA", "LA") or (orig_img.mode == "P" and "transparency" in orig_img.info)
        orig_rgba = orig_img.convert("RGBA")
        img_arr = np.array(orig_rgba)
        orig_h, orig_w = img_arr.shape[:2]

        applied_stamps = []
        inpaint_applied = False

        for stamp in stamps:
            box = stamp.get("box_2d")
            if not box or len(box) != 4:
                continue

            ymin, xmin, ymax, xmax = box
            py1 = max(0, int(round(ymin * orig_h / 1000.0)))
            px1 = max(0, int(round(xmin * orig_w / 1000.0)))
            py2 = min(orig_h, int(round(ymax * orig_h / 1000.0)))
            px2 = min(orig_w, int(round(xmax * orig_w / 1000.0)))

            if py2 <= py1 or px2 <= px1:
                continue

            # Neighbor Protection: Check overlap with protected neighbor areas (e.g. barcodes, ingredients)
            if neighbor_exclusion_boxes:
                should_skip = False
                for ex_box in neighbor_exclusion_boxes:
                    if len(ex_box) == 4:
                        ey1, ex1, ey2, ex2 = ex_box
                        # Compute overlap
                        inter_y1 = max(py1, ey1)
                        inter_x1 = max(px1, ex1)
                        inter_y2 = min(py2, ey2)
                        inter_x2 = min(px2, ex2)
                        if inter_y2 > inter_y1 and inter_x2 > inter_x1:
                            inter_area = (inter_y2 - inter_y1) * (inter_x2 - inter_x1)
                            stamp_area = (py2 - py1) * (px2 - px1)
                            if inter_area / stamp_area > 0.60:
                                should_skip = True
                                break
                if should_skip:
                    logger.info(f"Skipping stamp {stamp.get('stamp_type')} due to collision with protected packaging element.")
                    continue

            # Inpaint the single stamp using Color-Adaptive Surgical Inpainting
            img_arr = cls._inpaint_stamp_region(img_arr, px1, py1, px2, py2)
            inpaint_applied = True
            applied_stamps.append({
                "type": stamp.get("stamp_type", "mrp"),
                "display_name": stamp.get("display_name", "Stamp"),
                "text": stamp.get("text_content", ""),
                "box": [py1, px1, py2, px2],
            })

        if not inpaint_applied:
            return image_bytes, False, []

        result_img = Image.fromarray(img_arr)
        if not has_alpha:
            result_img = result_img.convert("RGB")

        buf = io.BytesIO()
        result_img.save(buf, format="PNG")
        logger.info(f"Successfully inpainted {len(applied_stamps)} stamp(s) on {filename} (BBID {bbid}) with adaptive color blending.")
        return buf.getvalue(), True, applied_stamps

    @staticmethod
    def _fit_surface_fill(
        patch_rgb: np.ndarray,
        sample: np.ndarray,
        max_resid: float = 7.0,
    ) -> Optional[np.ndarray]:
        """Least-squares quadratic surface per colour channel over the sampled clean-background pixels.

        Returns an image of the fitted surface (same size as patch_rgb), or None when there are too few samples
        or the background is not smooth enough for a surface to describe it (RMS residual above max_resid).
        """
        ys, xs = np.nonzero(sample)
        if len(xs) < 150:
            return None
        if len(xs) > 6000:
            pick = np.random.default_rng(0).choice(len(xs), 6000, replace=False)
            ys, xs = ys[pick], xs[pick]
        h, w = patch_rgb.shape[:2]

        def design(px, py):
            u = px / max(w - 1, 1) - 0.5
            v = py / max(h - 1, 1) - 0.5
            return np.stack([np.ones_like(u), u, v, u * u, u * v, v * v], axis=1)

        X = design(xs.astype(np.float64), ys.astype(np.float64))
        vals = patch_rgb[ys, xs].astype(np.float64)
        coef, *_ = np.linalg.lstsq(X, vals, rcond=None)
        resid = vals - X @ coef
        if float(np.sqrt(np.mean(resid ** 2))) > max_resid:
            return None

        gy, gx = np.mgrid[0:h, 0:w]
        G = design(gx.ravel().astype(np.float64), gy.ravel().astype(np.float64))
        return np.clip(G @ coef, 0, 255).reshape(h, w, 3).astype(np.uint8)

    @classmethod
    def _inpaint_stamp_region(
        cls,
        img_arr: np.ndarray,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
    ) -> np.ndarray:
        """
        Surgically remove a single stamp (per BigBasket SRS Section 5) while keeping the
        packaging around it pixel-identical.

        1. The stamp's own background colour is learned from INSIDE the box (k-means), not
           from a perimeter band - a band can leak onto a different surface (e.g. the white
           bottle around a black price strip) and tint the fill.
        2. Contrasting regions connected to the outside of the sampling patch (the bottle,
           a neighbouring panel) are protected and never repainted or sampled.
        3. Only the stamp strokes plus a thin anti-alias halo are repainted, via Telea
           diffusion fed exclusively with background-coloured pixels, then matched to the
           local grain. Untouched background pixels stay original, so no visible patch.
        """
        h_img, w_img = img_arr.shape[:2]
        box_w = x2 - x1
        box_h = y2 - y1
        if box_w <= 0 or box_h <= 0:
            return img_arr

        # 1. Safety padding so clipped characters (e.g. 'M', currency symbols) are covered
        pad_x = max(3, int(box_w * 0.04))
        pad_y = max(2, int(box_h * 0.04))
        sx1, sy1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
        sx2, sy2 = min(w_img, x2 + pad_x), min(h_img, y2 + pad_y)

        # Context band around the box (lets us tell "outside surface" from "stamp text")
        # Gemini boxes are often loose or shifted, clipping the first/last characters of the stamp. The window must
        # reach far enough past the box to hold those characters whole, so they are not mistaken for the outside.
        band_x = max(8, int(box_h * 0.8))
        band_y = max(4, int(box_h * 0.25))
        ox1, oy1 = max(0, sx1 - band_x), max(0, sy1 - band_y)
        ox2, oy2 = min(w_img, sx2 + band_x), min(h_img, sy2 + band_y)

        patch = img_arr[oy1:oy2, ox1:ox2].copy()
        patch_h, patch_w = patch.shape[:2]
        if patch_h < 4 or patch_w < 4:
            return img_arr

        iy1, ix1, iy2, ix2 = sy1 - oy1, sx1 - ox1, sy2 - oy1, sx2 - ox1
        in_box = np.zeros((patch_h, patch_w), dtype=bool)
        in_box[iy1:iy2, ix1:ix2] = True

        patch_rgb = np.ascontiguousarray(patch[:, :, :3])
        opaque = patch[:, :, 3] > 20 if patch.shape[2] == 4 else np.ones((patch_h, patch_w), dtype=bool)

        box_px = patch_rgb[in_box & opaque].astype(np.float32)
        if len(box_px) < 16:
            return img_arr

        # 2. Learn the stamp background colour from inside the box
        # Per BigBasket SRS Section 5 (MRP and Expiry Information Removal):
        # A stamp zone can sit on packaging foil, inside a white/light stamp window, or span both.
        # Major color surfaces (>= 15% of box pixels) are valid background surfaces.
        # Text strokes are the fine minority cluster (< 15% of pixels).
        k = 3 if len(box_px) >= 64 else 2
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
        _, labels, centers = cv2.kmeans(box_px, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
        counts = np.bincount(labels.ravel(), minlength=k)
        total_box_px = len(box_px)
        dom = int(np.argmax(counts))
        # Background clusters: the dominant cluster, plus any subtle gradient/shading clusters
        # close to it (< 50.0 distance). Never classify high-contrast text strokes as background.
        # Major secondary background surfaces (e.g. split panels) must be >= 35% of box and moderately close (< 120.0).
        bg_clusters = [
            c for c in range(k)
            if (c == dom)
            or (np.linalg.norm(centers[c] - centers[dom]) < 50.0)
            or (counts[c] / max(1, total_box_px) >= 0.35 and np.linalg.norm(centers[c] - centers[dom]) < 120.0)
        ]

        flat = patch_rgb.reshape(-1, 3).astype(np.float32)
        dists = np.linalg.norm(flat[:, None, :] - centers[None, :, :], axis=2)
        nearest = np.argmin(dists, axis=1).reshape(patch_h, patch_w)
        is_bg = np.isin(nearest, bg_clusters) & opaque
        bg_color = np.median(patch_rgb[is_bg & in_box], axis=0) if np.any(is_bg & in_box) else centers[dom]

        # 3. Decide, per connected component of non-background pixels, whether it is stamp text.
        #    - Large / long components (bottle, borders, neighbouring panels) that run off the window are protected.
        #    - A glyph with at least 35% of its area inside the box is part of the stamp: erase the WHOLE glyph.
        #    - Boxes often cut through the first/last characters (less than 35% inside) or stop short of the end of
        #      the line. So the erased text is grown along the same text line, glyph by glyph, while the gap to the
        #      next glyph stays letter-sized. Glyphs on other lines are never touched.
        foreign = (~is_bg).astype(np.uint8)
        n_comp, comp, cstats, _ = cv2.connectedComponentsWithStats(foreign, connectivity=8)
        edge_ids = set(
            int(i) for i in np.unique(np.concatenate([comp[0, :], comp[-1, :], comp[:, 0], comp[:, -1]])) if i > 0
        )
        in_box_ids = np.unique(comp[in_box & foreign.astype(bool)])
        in_box_ids = in_box_ids[in_box_ids > 0]

        heights = [int(cstats[i, cv2.CC_STAT_HEIGHT]) for i in in_box_ids if cstats[i, cv2.CC_STAT_AREA] >= 6]
        glyph_h = float(np.median(heights)) if heights else float(box_h)
        glyph_h = max(glyph_h, 4.0)

        def glyph_like(i: int) -> bool:
            x0, y0 = int(cstats[i, cv2.CC_STAT_LEFT]), int(cstats[i, cv2.CC_STAT_TOP])
            gw, gh = int(cstats[i, cv2.CC_STAT_WIDTH]), int(cstats[i, cv2.CC_STAT_HEIGHT])
            # Printed structure is never a glyph: anything spanning the whole window (a box edge, a table rule),
            # or a long thin line much taller than the text.
            if (y0 <= 0 and y0 + gh >= patch_h) or (x0 <= 0 and x0 + gw >= patch_w):
                return False
            if gh > 1.4 * glyph_h and gw < 0.3 * gh:
                return False
            return gh <= max(2.2 * glyph_h, 8) and gw <= 12 * glyph_h

        total = np.bincount(comp.ravel(), minlength=n_comp)
        inside = np.bincount(comp[in_box].ravel(), minlength=n_comp)
        erase_ids = set()
        for i in in_box_ids:
            i = int(i)
            if i in edge_ids and not glyph_like(i):
                continue  # a surface that continues outside the window
            if inside[i] / max(total[i], 1) >= 0.35:
                erase_ids.add(i)

        # Grow along the text line: same rows as the box, next glyph within letter spacing of the erased text.
        # Only glyphs at letter-spacing distance are pulled in. A word gap or more means a different word, which
        # is usually the field label standing next to the value ("Date of Packaging :"), and the label must stay.
        gap_thr = max(0.3 * glyph_h, 2.0)
        # Slivers of a glyph (a box that stops a hair short of the last character leaves just the tail of it)
        # may attach from a little further away; whole glyphs of the next word may not.
        areas = [int(cstats[i, cv2.CC_STAT_AREA]) for i in in_box_ids if cstats[i, cv2.CC_STAT_AREA] >= 6]
        sliver_area = 0.15 * float(np.median(areas)) if areas else 0.0
        sliver_gap_thr = max(0.8 * glyph_h, 4.0)
        row_lo, row_hi = iy1, iy2
        others = [
            i for i in range(1, n_comp)
            if i not in erase_ids and glyph_like(i)
        ]
        grew = True
        while grew and erase_ids and others:
            grew = False
            boxes = [
                (cstats[i, cv2.CC_STAT_LEFT], cstats[i, cv2.CC_STAT_LEFT] + cstats[i, cv2.CC_STAT_WIDTH])
                for i in erase_ids
                if cstats[i, cv2.CC_STAT_TOP] < row_hi and cstats[i, cv2.CC_STAT_TOP] + cstats[i, cv2.CC_STAT_HEIGHT] > row_lo
            ]
            if not boxes:
                break
            for i in list(others):
                top = int(cstats[i, cv2.CC_STAT_TOP])
                hgt = int(cstats[i, cv2.CC_STAT_HEIGHT])
                overlap = min(top + hgt, row_hi) - max(top, row_lo)
                if overlap < 0.6 * hgt:
                    continue  # a different text line
                left = int(cstats[i, cv2.CC_STAT_LEFT])
                right = left + int(cstats[i, cv2.CC_STAT_WIDTH])
                gap = min(max(0, left - bx_r, bx_l - right) for bx_l, bx_r in boxes)
                limit = sliver_gap_thr if cstats[i, cv2.CC_STAT_AREA] <= sliver_area else gap_thr
                if gap <= limit:
                    erase_ids.add(i)
                    others.remove(i)
                    grew = True

        erase_mask = np.isin(comp, list(erase_ids)) if erase_ids else np.zeros((patch_h, patch_w), dtype=bool)
        # Everything that is not stamp text stays untouched and is never sampled.
        protected = (foreign.astype(bool) & ~erase_mask) | ~opaque
        grown = cv2.dilate(erase_mask.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        work_area = in_box | (grown.astype(bool) & ~protected)

        # 5. Target = stamp strokes + anti-alias halo, never protected pixels
        strokes = erase_mask.copy()

        # JPEG ringing / chroma fringes around the text sit close enough to the background
        # to be clustered with it, but leave a visible "ghost" of the digits if kept.
        # Compare every pixel with a locally smoothed background estimate (normalised
        # convolution over background pixels only, so it follows gradients) and treat
        # clear outliers as strokes too.
        clean_bg = (is_bg & ~protected).astype(np.float32)
        ksize = max(9, (min(box_w, box_h) // 2) | 1)
        weight = cv2.GaussianBlur(clean_bg, (ksize, ksize), 0)
        local_bg = cv2.GaussianBlur(patch_rgb.astype(np.float32) * clean_bg[..., None], (ksize, ksize), 0)
        local_bg /= np.maximum(weight, 1e-3)[..., None]
        deviation = np.linalg.norm(patch_rgb.astype(np.float32) - local_bg, axis=2)
        bg_dev = deviation[is_bg & in_box & ~strokes]
        if bg_dev.size > 20 and strokes.any():
            ring_thr = max(8.0, 3.0 * float(np.percentile(bg_dev, 50)))
            # Ringing only ever hugs the text, so look just around real strokes - this keeps
            # permanent details like a label's darker edge line from being repainted.
            near_text = cv2.dilate(
                strokes.astype(np.uint8),
                cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)),
            ).astype(bool)
            strokes |= (deviation > ring_thr) & near_text & work_area & ~protected & (weight > 0.05)
            # The box is the model's statement of where the value is: whatever inside it is clearly darker or
            # lighter than the surrounding background is part of the value (pieces of thick strokes that the
            # glyph pass missed), except printed structure that runs on outside the window.
            structure = np.isin(comp, [i for i in edge_ids if not glyph_like(i)]) if edge_ids else np.zeros_like(in_box)
            strokes |= (deviation > ring_thr) & in_box & ~structure & opaque & (weight > 0.05)

        strokes = strokes.astype(np.uint8)
        if not strokes.any():
            # Low-contrast stamp: nothing separable, clear the whole box except protected surfaces
            strokes = (in_box & ~protected).astype(np.uint8)
        halo = cv2.dilate(strokes, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        target = (halo.astype(bool) & work_area & ~protected)
        if not target.any():
            return img_arr

        # 6. Diffuse only from background pixels: neutralise protected ones before Telea
        src = patch_rgb.copy()
        src[protected] = bg_color.astype(np.uint8)
        inpainted = cv2.cvtColor(
            cv2.inpaint(
                cv2.cvtColor(src, cv2.COLOR_RGB2BGR),
                target.astype(np.uint8) * 255,
                inpaintRadius=3,
                flags=cv2.INPAINT_TELEA,
            ),
            cv2.COLOR_BGR2RGB,
        )

        # 6b. On a smooth label (flat or gently graded paper) Telea diffusion leaves soft, slightly off-tone
        #     smudges where the text was. Fit a smooth surface to the surrounding clean background and paint with
        #     that instead, so the fill continues the exact tone and gradient. Textured backgrounds (foil,
        #     photos) fail the fit test and keep the Telea result.
        surface = cls._fit_surface_fill(
            patch_rgb,
            sample=is_bg & ~protected & opaque & ~cv2.dilate(target.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool),
        )
        if surface is not None:
            inpainted[target] = surface[target]

        # 7. Match local grain (matte / JPEG texture) so the fill doesn't look airbrushed
        bg_ref = is_bg & in_box & ~target
        if bg_ref.sum() > 20:
            smooth = cv2.GaussianBlur(patch_rgb, (5, 5), 0).astype(np.float32)
            # Robust (MAD) estimate so edges/details inside the box can't inflate the grain
            resid = (patch_rgb.astype(np.float32)[bg_ref] - smooth[bg_ref]).mean(axis=1)
            grain = 1.4826 * float(np.median(np.abs(resid - np.median(resid))))
            grain = min(grain * 0.6, 4.0)
            if grain > 0.5:
                # Luminance-only grain: per-channel noise shows up as colour speckle on dark surfaces
                noise = np.random.normal(0, grain, (patch_h, patch_w, 1)).astype(np.float32)
                out = inpainted.astype(np.float32)
                # Near pure white/black the noise would be clipped on one side only, shifting the
                # mean and leaving a faint ghost - scale it down by the available headroom.
                headroom = np.minimum(out, 255.0 - out).min(axis=2, keepdims=True)
                noise *= np.clip(headroom / (3.0 * grain), 0.0, 1.0)
                out[target] += noise[target]
                inpainted = np.clip(out, 0, 255).astype(np.uint8)

        patch_rgb[target] = inpainted[target]
        patch[:, :, :3] = patch_rgb
        img_arr[oy1:oy2, ox1:ox2] = patch
        return img_arr
