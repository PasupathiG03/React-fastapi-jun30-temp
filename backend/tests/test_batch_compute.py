"""_compute_image must work with the REAL HybridAiManager (a mocked manager once hid a signature mismatch)."""
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch

from PIL import Image

from app.services.bigbasket.ai_provider import HybridAiManager
from app.services.bigbasket.batch_processor import BatchProcessor
from app.services.bigbasket.gemini_service import GeminiClassificationService, GeminiProductClassification
from app.services.bigbasket.storage import BigBasketStorage
from fixtures import TEST_PRESET


class TestBatchCompute(unittest.TestCase):
    def test_compute_image_with_real_ai_manager(self):
        tmp = Path(tempfile.mkdtemp())
        for d in ("original", "cache", "processed"):
            (tmp / d).mkdir()
        buf = io.BytesIO()
        Image.new("RGB", (600, 600), (250, 250, 250)).save(buf, "PNG")
        src = tmp / "original" / "sku_2.png"
        src.write_bytes(buf.getvalue())

        # A nutrition panel: no background removal, no Gemini stamp call, so no network or model needed.
        fake = GeminiProductClassification(
            primary_category="FOOD", subcategory="x", product_type="x",
            classification_confidence=0.99, requires_manual_review=False,
        )
        fake.image_type = "nutritional"
        job = NS(image_id=1, bbid="sku", filename="sku_2.png", original_file_path=str(src), image_type="unknown",
                 sequence_order=2, final_output_path=None, category="FOOD", batch_id=1,
                 batch=NS(batch_code="T", name="t", created_at=None))
        with patch.object(BigBasketStorage, "get_batch_dir", return_value=tmp), \
             patch.object(GeminiClassificationService, "classify_image", return_value=fake):
            out = BatchProcessor._compute_image(job, {**TEST_PRESET, "auto_inpaint_mrp": False}, HybridAiManager())

        self.assertTrue(out["ok"], out.get("error"))
        self.assertEqual(out["effective_type"], "nutritional")
        self.assertTrue((tmp / "processed" / "sku_2.png").exists())


if __name__ == "__main__":
    unittest.main()
