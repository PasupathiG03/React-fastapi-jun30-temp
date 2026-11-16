"""Stamp removal must erase the whole stamp even when Gemini's box is loose, and never touch printed structure."""
import io
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from app.services.bigbasket.gemini_service import GeminiClassificationService
from app.services.bigbasket.inpaint_service import DynamicInpaintService

W, H = 600, 300
TEXT_BOX = (200, 120, 460, 170)  # x1, y1, x2, y2 in pixels
LABEL_X = 165
LABEL_TEXT, VALUE_TEXT = "Date of Packaging :", "15/11/2026"


def _font(size):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


# A realistic word gap (a little under one glyph height) between the label and its value.
VALUE_X = LABEL_X + int(_font(22).getlength(LABEL_TEXT)) + 14


def _label(with_label: bool = False) -> bytes:
    """Off-white label with a soft vertical gradient, a printed border on the left, and an 'MRP' stamp."""
    y = np.linspace(238, 246, H)[:, None]
    base = np.repeat(np.repeat(y[:, :, None], W, axis=1), 3, axis=2).astype(np.uint8)
    img = Image.fromarray(base)
    d = ImageDraw.Draw(img)
    d.line([(150, 20), (150, 280)], fill=(20, 20, 20), width=3)  # border: must survive
    size = 22 if with_label else 34  # the label + value line must fit the 600 px canvas with a word gap
    font = _font(size)
    if with_label:
        # "Date of Packaging :" is permanent printing; only the value after it is a stamp.
        d.text((LABEL_X, TEXT_BOX[1] + 5), LABEL_TEXT, fill=(15, 15, 15), font=font)
        d.text((VALUE_X, TEXT_BOX[1] + 5), VALUE_TEXT, fill=(15, 15, 15), font=font)
    else:
        d.text((TEXT_BOX[0], TEXT_BOX[1] + 5), "MRP 847.00/-", fill=(15, 15, 15), font=font)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)  # real photos carry JPEG ringing around text
    return buf.getvalue()


def _run(box_px, with_label: bool = False):
    x1, y1, x2, y2 = box_px
    stamps = {
        "has_removable_stamps": True,
        "detection_ok": True,
        "stamps": [{"stamp_type": "mrp", "box_2d": [y1 * 1000 / H, x1 * 1000 / W, y2 * 1000 / H, x2 * 1000 / W]}],
    }
    with patch.object(GeminiClassificationService, "detect_mrp_expiry_stamps", return_value=stamps):
        out, applied, _ = DynamicInpaintService.detect_and_inpaint_stamps(
            _label(with_label), bbid="t", filename="t.png"
        )
    assert applied
    return np.array(Image.open(io.BytesIO(out)).convert("L")).astype(int)


class TestInpaintStamps(unittest.TestCase):
    def _assert_clean(self, gray: np.ndarray):
        text_zone = gray[TEXT_BOX[1] - 5 : TEXT_BOX[3] + 5, TEXT_BOX[0] - 15 : TEXT_BOX[2] + 40]
        self.assertGreater(int(text_zone.min()), 200, "dark stamp pixels were left behind")
        # Off-tone pixels (smudge / ghost of the old text) compared with an untouched part of the same label.
        control = gray[220:270, TEXT_BOX[0] - 15 : TEXT_BOX[2] + 40]
        off_tone = float(np.mean(np.abs(text_zone - np.median(control)) > 12))
        self.assertLess(off_tone, 0.01, "visible smudge where the stamp was")
        self.assertLess(int(gray[150, 148:153].min()), 60, "the printed border was erased")

    def test_tight_box(self):
        self._assert_clean(_run(TEXT_BOX))

    def test_box_clipping_the_start_of_the_text(self):
        # Box begins at the very end of the first glyph (well under 35% of it inside) and stops short of the end
        # of the line, like the boxes Gemini returns for real labels.
        self._assert_clean(_run((TEXT_BOX[0] + 25, TEXT_BOX[1], TEXT_BOX[2] - 70, TEXT_BOX[3])))

    def test_label_is_kept_and_only_the_value_is_erased(self):
        before = np.array(Image.open(io.BytesIO(_label(True))).convert("L")).astype(int)
        # Box on the value, clipped a little into its first glyph, like Gemini's boxes on real labels.
        after = _run((VALUE_X + 4, TEXT_BOX[1], 600, TEXT_BOX[3]), with_label=True)
        label_zone = (slice(TEXT_BOX[1], TEXT_BOX[3]), slice(LABEL_X - 5, VALUE_X - 10))
        self.assertLess(int(np.abs(after[label_zone] - before[label_zone]).max()), 3, "the label was altered")
        value_zone = after[TEXT_BOX[1] : TEXT_BOX[3], VALUE_X - 5 : 600]
        self.assertGreater(int(value_zone.min()), 200, "value pixels were left behind")


if __name__ == "__main__":
    unittest.main()
