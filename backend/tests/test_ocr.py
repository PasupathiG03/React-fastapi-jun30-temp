"""OCR (EasyOCR) initialisation, detection and failure handling.

Run from backend/:  .\\env\\Scripts\\python.exe -m unittest discover -s tests -t .
Real-model check:   set RUN_EASYOCR_INTEGRATION=1 first (loads EasyOCR; slow, needs the models downloaded).
"""
import io
import os
import sys
import types
import unittest
from unittest import mock

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from app.services.bigbasket import sub_region_extractor as sre
from app.services.bigbasket.sub_region_extractor import OcrError, SubRegionExtractor


def _png_bytes(w: int = 400, h: int = 200) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(buf, format="PNG")
    return buf.getvalue()


def _fake_easyocr(readtext_result=None, reader_error=None, readtext_error=None):
    """A stand-in `easyocr` module whose Reader records how often it was constructed."""
    module = types.ModuleType("easyocr")
    module.constructed = []

    class Reader:
        def __init__(self, langs, gpu=True):
            if reader_error:
                raise reader_error
            module.constructed.append((list(langs), gpu))

        def readtext(self, arr):
            if readtext_error:
                raise readtext_error
            return readtext_result or []

    module.Reader = Reader
    return module


# EasyOCR's real output uses numpy ints/floats; read_text must turn them into plain Python types.
SAMPLE_EASYOCR_OUTPUT = [
    ([[np.int32(10), np.int32(20)], [np.int32(110), np.int32(20)],
      [np.int32(110), np.int32(45)], [np.int32(10), np.int32(45)]], "INGREDIENTS: Wheat", np.float64(0.93)),
    ([[5, 60], [90, 60], [90, 80], [5, 80]], "FSSAI Lic No 10012345678901", np.float64(0.88)),
]


class OcrTestCase(unittest.TestCase):
    def setUp(self):
        sre._reset_ocr_reader_for_tests()

    def tearDown(self):
        sre._reset_ocr_reader_for_tests()


class TestOcrInitialisation(OcrTestCase):
    def test_reader_created_once_with_english_cpu(self):
        fake = _fake_easyocr()
        with mock.patch.dict(sys.modules, {"easyocr": fake}):
            first = sre.get_ocr_reader()
            second = sre.get_ocr_reader()
            sre.read_text(np.zeros((10, 10, 3), dtype=np.uint8))
        self.assertIs(first, second)
        self.assertEqual(fake.constructed, [(["en"], False)])
        self.assertEqual(sre.get_ocr_status(), {"engine": "easyocr", "status": "ready", "available": True})

    def test_status_is_initializing_before_first_use(self):
        self.assertEqual(sre.get_ocr_status()["status"], "initializing")

    def test_no_rapidocr_or_dummy_fallback(self):
        self.assertFalse(hasattr(sre, "DummyOCR"))
        with open(sre.__file__, encoding="utf-8") as f:
            src = f.read()
        self.assertNotIn("rapidocr", src.lower())
        self.assertNotIn("DummyOCR", src)


class TestOcrDetection(OcrTestCase):
    def test_read_text_keeps_bbox_text_conf_format(self):
        fake = _fake_easyocr(readtext_result=SAMPLE_EASYOCR_OUTPUT)
        with mock.patch.dict(sys.modules, {"easyocr": fake}):
            results = sre.read_text(np.zeros((100, 200, 3), dtype=np.uint8))
        self.assertEqual(len(results), 2)
        bbox, text, conf = results[0]
        self.assertEqual(bbox, [[10.0, 20.0], [110.0, 20.0], [110.0, 45.0], [10.0, 45.0]])
        self.assertEqual(text, "INGREDIENTS: Wheat")
        self.assertAlmostEqual(conf, 0.93)
        self.assertIs(type(conf), float)
        self.assertTrue(all(type(v) is float for point in bbox for v in point))

    def test_detect_information_sections_uses_ocr_text(self):
        fake = _fake_easyocr(readtext_result=SAMPLE_EASYOCR_OUTPUT)
        with mock.patch.dict(sys.modules, {"easyocr": fake}):
            detected = SubRegionExtractor.detect_information_sections(_png_bytes())
        self.assertTrue(detected["ocr_available"])
        self.assertTrue(detected["has_ingredients"])
        self.assertTrue(detected["has_fssai"])

    def test_detect_and_extract_sub_regions_still_crops(self):
        fake = _fake_easyocr(readtext_result=SAMPLE_EASYOCR_OUTPUT)
        with mock.patch.dict(sys.modules, {"easyocr": fake}):
            crops = SubRegionExtractor.detect_and_extract_sub_regions(_png_bytes(), bbid="123", category="food")
        self.assertIn("ingredient", [c["category"] for c in crops])


class TestOcrFailure(OcrTestCase):
    def test_missing_easyocr_raises_and_reports_unavailable(self):
        with mock.patch.dict(sys.modules, {"easyocr": None}):  # import easyocr -> ImportError
            with self.assertLogs(sre.logger, level="ERROR") as logs:
                with self.assertRaises(OcrError):
                    sre.get_ocr_reader()
        self.assertTrue(any("EasyOCR initialisation failed" in line for line in logs.output))
        self.assertEqual(sre.get_ocr_status(), {"engine": "easyocr", "status": "unavailable", "available": False})

    def test_failed_init_is_not_retried_per_image(self):
        fake = _fake_easyocr(reader_error=RuntimeError("model download failed"))
        reader_spy = mock.Mock(side_effect=fake.Reader)
        fake.Reader = reader_spy
        with mock.patch.dict(sys.modules, {"easyocr": fake}):
            for _ in range(3):
                with self.assertRaises(OcrError):
                    sre.read_text(np.zeros((10, 10, 3), dtype=np.uint8))
        self.assertEqual(reader_spy.call_count, 1)

    def test_runtime_failure_raises_instead_of_empty(self):
        fake = _fake_easyocr(readtext_error=RuntimeError("inference crashed"))
        with mock.patch.dict(sys.modules, {"easyocr": fake}):
            with self.assertRaises(OcrError):
                sre.read_text(np.zeros((10, 10, 3), dtype=np.uint8))

    def test_information_sections_flag_failure_not_empty_success(self):
        with mock.patch.dict(sys.modules, {"easyocr": None}):
            detected = SubRegionExtractor.detect_information_sections(_png_bytes())
        self.assertFalse(detected["ocr_available"])
        self.assertIn("OCR unavailable", detected["ocr_error"])
        self.assertNotIn("has_ingredients", detected)

    def test_sub_region_extraction_raises_instead_of_returning_no_crops(self):
        with mock.patch.dict(sys.modules, {"easyocr": None}):
            with self.assertRaises(OcrError):
                SubRegionExtractor.detect_and_extract_sub_regions(_png_bytes(), bbid="123")

    def test_batch_image_marked_needs_review(self):
        from app.services.bigbasket.batch_processor import BatchProcessor

        img = types.SimpleNamespace(status="auto_approved", validation_results={"passed": True})
        BatchProcessor._mark_ocr_unavailable(img, "OCR unavailable (easyocr): ImportError")
        self.assertEqual(img.status, "needs_review")
        self.assertFalse(img.validation_results["passed"])
        self.assertEqual(img.validation_results["ocr_status"]["available"], False)
        self.assertTrue(any("OCR unavailable" in r for r in img.validation_results["failure_reasons"]))

    def test_failed_image_stays_failed(self):
        from app.services.bigbasket.batch_processor import BatchProcessor

        img = types.SimpleNamespace(status="failed", validation_results=None)
        BatchProcessor._mark_ocr_unavailable(img, "x")
        self.assertEqual(img.status, "failed")


@unittest.skipUnless(os.getenv("RUN_EASYOCR_INTEGRATION") == "1", "set RUN_EASYOCR_INTEGRATION=1 to load real EasyOCR")
class TestRealEasyOcr(OcrTestCase):
    def test_reads_rendered_text(self):
        img = Image.new("RGB", (900, 160), "white")
        ImageDraw.Draw(img).text((30, 40), "INGREDIENTS WHEAT", fill="black", font=ImageFont.load_default(size=64))
        results = sre.read_text(np.array(img))
        self.assertTrue(results, "EasyOCR returned no text")
        bbox, text, conf = results[0]
        self.assertEqual(len(bbox), 4)
        self.assertIn("INGREDIENTS", " ".join(r[1].upper() for r in results))
        self.assertGreater(conf, 0.3)


if __name__ == "__main__":
    unittest.main()
