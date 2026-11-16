"""ConsensusAiManager: double-checks FOP/BOP answers and lets Rerun bypass the classification cache."""
import unittest
from unittest.mock import patch

from app.services.bigbasket.ai_provider import GeminiAiProvider
from app.services.bigbasket.classification_guard import ConsensusAiManager
from app.services.bigbasket.gemini_service import GeminiClassificationService

IMG = b"fake-image-bytes"


def pred(image_type: str, confidence: float = 0.98, primary: str = "NON_FOOD", review: bool = False):
    return {
        "predicted_category": image_type,
        "primary_category": primary,
        "confidence_score": confidence,
        "requires_manual_review": review,
        "reasoning": f"answer {image_type}",
    }


FAILED = pred("unknown", confidence=0.0, primary="UNKNOWN", review=True)


class TestConsensusAiManager(unittest.TestCase):
    def setUp(self):
        GeminiClassificationService._CACHE.clear()

    def run_with(self, answers, fresh=False):
        with patch.object(GeminiAiProvider, "classify_and_analyze_sync", side_effect=answers) as mock:
            out = ConsensusAiManager(fresh=fresh).analyze_image_sync(IMG, "x.jpg", bbid="sku")
        return out, mock.call_count

    def test_non_bg_removal_type_makes_one_call(self):
        out, calls = self.run_with([pred("lifestyle")])
        self.assertEqual(calls, 1)
        self.assertEqual(out["predicted_category"], "lifestyle")
        self.assertFalse(out["requires_manual_review"])

    def test_fop_confirmed_by_second_call(self):
        out, calls = self.run_with([pred("fop", 0.99), pred("fop", 0.95)])
        self.assertEqual(calls, 2)
        self.assertEqual(out["predicted_category"], "fop")
        self.assertFalse(out["requires_manual_review"])
        self.assertEqual(out["confidence_score"], 0.95)

    def test_fop_disagreement_routes_to_manual_review(self):
        out, calls = self.run_with([pred("fop"), pred("lifestyle")])
        self.assertEqual(calls, 2)
        self.assertTrue(out["requires_manual_review"])
        self.assertIn("inconsistent", out["reasoning"])

    def test_failed_confirmation_routes_to_manual_review(self):
        out, _ = self.run_with([pred("bop"), FAILED])
        self.assertTrue(out["requires_manual_review"])
        self.assertIn("confirmation call failed", out["reasoning"])

    def test_already_flagged_fop_is_not_rechecked(self):
        out, calls = self.run_with([pred("fop", review=True)])
        self.assertEqual(calls, 1)
        self.assertTrue(out["requires_manual_review"])

    def test_disagreement_clears_cached_answer(self):
        key = GeminiClassificationService.get_image_hash(IMG)
        GeminiClassificationService._CACHE[key] = object()
        self.run_with([pred("fop"), pred("lifestyle")])
        self.assertNotIn(key, GeminiClassificationService._CACHE)

    def test_fresh_drops_cache_before_first_call(self):
        key = GeminiClassificationService.get_image_hash(IMG)
        GeminiClassificationService._CACHE[key] = object()
        seen = []

        def answer(*_args, **_kwargs):
            seen.append(key in GeminiClassificationService._CACHE)
            return pred("lifestyle")

        with patch.object(GeminiAiProvider, "classify_and_analyze_sync", side_effect=answer):
            ConsensusAiManager(fresh=True).analyze_image_sync(IMG, "x.jpg")
        self.assertEqual(seen, [False])


class TestGuardThroughPipeline(unittest.TestCase):
    def test_disagreement_skips_bg_removal_and_needs_review(self):
        import io
        import tempfile
        from pathlib import Path
        from types import SimpleNamespace as NS

        from PIL import Image

        from app.services.bigbasket.batch_processor import BatchProcessor
        from app.services.bigbasket.storage import BigBasketStorage

        GeminiClassificationService._CACHE.clear()
        tmp = Path(tempfile.mkdtemp())
        for d in ("original", "cache", "processed"):
            (tmp / d).mkdir()
        buf = io.BytesIO()
        Image.new("RGB", (600, 600), (250, 250, 250)).save(buf, "PNG")
        src = tmp / "original" / "sku_1.png"
        src.write_bytes(buf.getvalue())
        job = NS(image_id=1, bbid="sku", filename="sku_1.png", original_file_path=str(src), image_type="unknown",
                 sequence_order=1, final_output_path=None, category="FOOD", batch_id=1,
                 batch=NS(batch_code="T", name="t", created_at=None))

        with patch.object(BigBasketStorage, "get_batch_dir", return_value=tmp), \
             patch.object(GeminiAiProvider, "classify_and_analyze_sync", side_effect=[pred("fop"), pred("lifestyle")]):
            out = BatchProcessor._compute_image(job, {"auto_inpaint_mrp": False}, ConsensusAiManager())

        self.assertTrue(out["ok"], out.get("error"))
        self.assertEqual(out["status"], "needs_review")
        self.assertFalse(out["photoroom_called"])
        self.assertIn("inconsistent", out["validation_results"]["gemini_classification"]["reasoning"])


if __name__ == "__main__":
    unittest.main()
