"""Unit test for BatchProcessor.rerun_entire_batch functionality."""
import unittest
from unittest.mock import MagicMock, patch

from app.models.bigbasket import ImageBatch, BatchImage
from app.services.bigbasket.batch_processor import BatchProcessor


class TestBatchRerun(unittest.TestCase):
    def setUp(self):
        self.mock_db = MagicMock()

    def test_rerun_batch_not_found(self):
        self.mock_db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(ValueError) as ctx:
            BatchProcessor.rerun_entire_batch(self.mock_db, 999)
        self.assertIn("not found", str(ctx.exception).lower())

    def test_rerun_batch_already_processing(self):
        batch = ImageBatch(id=1, batch_code="BATCH-1", status="processing")
        self.mock_db.query.return_value.filter.return_value.first.return_value = batch
        with self.assertRaises(ValueError) as ctx:
            BatchProcessor.rerun_entire_batch(self.mock_db, 1)
        self.assertIn("already processing", str(ctx.exception).lower())

    def test_rerun_batch_no_images(self):
        batch = ImageBatch(id=1, batch_code="BATCH-1", status="completed")
        self.mock_db.query.return_value.filter.return_value.first.return_value = batch
        self.mock_db.query.return_value.filter.return_value.all.return_value = []
        with self.assertRaises(ValueError) as ctx:
            BatchProcessor.rerun_entire_batch(self.mock_db, 1)
        self.assertIn("no images", str(ctx.exception).lower())

    def test_rerun_batch_success_resets_images_and_batch(self):
        batch = ImageBatch(
            id=1,
            batch_code="BATCH-1",
            status="completed",
            total_images=2,
            processed_images=2,
            approved_images=1,
            review_needed_images=1,
            failed_images=0,
            zip_export_path="/path/to/zip",
            excel_report_path="/path/to/excel",
            config={"dpi": 150},
        )
        img1 = BatchImage(
            id=10,
            batch_id=1,
            bbid="SKU1",
            status="auto_approved",
            confidence_score=0.98,
            error_message=None,
        )
        img2 = BatchImage(
            id=11,
            batch_id=1,
            bbid="SKU2",
            status="needs_review",
            confidence_score=0.75,
            error_message="Requires manual check",
        )

        def query_side_effect(model):
            mock_q = MagicMock()
            if model == ImageBatch:
                mock_q.filter.return_value.first.return_value = batch
            elif model == BatchImage:
                mock_q.filter.return_value.all.return_value = [img1, img2]
            return mock_q

        self.mock_db.query.side_effect = query_side_effect

        with patch.object(BatchProcessor, "_log_event"):
            result_batch = BatchProcessor.rerun_entire_batch(self.mock_db, 1, provider="photoroom")

        # Verify batch status and counters reset
        self.assertEqual(result_batch.status, "queued")
        self.assertEqual(result_batch.processed_images, 0)
        self.assertEqual(result_batch.approved_images, 0)
        self.assertEqual(result_batch.review_needed_images, 0)
        self.assertEqual(result_batch.failed_images, 0)
        self.assertEqual(result_batch.total_images, 2)
        self.assertIsNone(result_batch.zip_export_path)
        self.assertIsNone(result_batch.excel_report_path)
        self.assertEqual(result_batch.config.get("bg_removal_provider"), "photoroom")

        # Verify images reset
        self.assertEqual(img1.status, "pending")
        self.assertIsNone(img1.confidence_score)
        self.assertIsNone(img1.error_message)

        self.assertEqual(img2.status, "pending")
        self.assertIsNone(img2.confidence_score)
        self.assertIsNone(img2.error_message)

        # Verify commit called
        self.mock_db.commit.assert_called_once()

    def test_rerun_batch_api_handler(self):
        import asyncio
        from app.api.bigbasket.batches import rerun_batch

        batch = ImageBatch(id=125, batch_code="IS-BATCH-125", status="queued", total_images=10)
        with patch.object(BatchProcessor, "rerun_entire_batch", return_value=batch), \
             patch("app.api.bigbasket.batches.dispatch_batch_processing"), \
             patch("app.api.bigbasket.batches.BigBasketEventBroadcaster.publish_event") as mock_publish:
            res = asyncio.run(rerun_batch(batch_id=125, provider=None, db=self.mock_db, current_user=MagicMock()))

        self.assertEqual(res["status"], "queued")
        self.assertEqual(res["batch_id"], 125)
        self.assertEqual(res["count"], 10)
        mock_publish.assert_called_once()


if __name__ == "__main__":
    unittest.main()

