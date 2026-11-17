import asyncio
import unittest
from unittest.mock import MagicMock, patch

from app.models.bigbasket import BatchImage, ImageBatch
from app.tasks.batch_tasks import (
    dispatch_single_image_task,
    process_single_image_task,
)


class TestSingleImageTasks(unittest.TestCase):
    def test_dispatch_calls_celery_delay(self):
        with patch("app.tasks.batch_tasks.process_single_image_task.delay") as mock_delay:
            mock_task = MagicMock()
            mock_task.id = "mock-task-123"
            mock_delay.return_value = mock_task

            dispatch_single_image_task(image_id=42, provider="photoroom", skip_classification=False)

            mock_delay.assert_called_once_with(42, provider="photoroom", skip_classification=False)

    def test_dispatch_falls_back_to_thread_when_celery_fails(self):
        with patch("app.tasks.batch_tasks.process_single_image_task.delay", side_effect=Exception("Redis down")):
            with patch("threading.Thread") as mock_thread_cls:
                mock_thread = MagicMock()
                mock_thread_cls.return_value = mock_thread

                dispatch_single_image_task(image_id=99, provider="birefnet", skip_classification=True)

                mock_thread_cls.assert_called_once()
                mock_thread.start.assert_called_once()

    def test_process_single_image_task_retry(self):
        with patch("app.core.database.SessionLocal") as mock_session_local:
            mock_db = MagicMock()
            mock_session_local.return_value = mock_db

            with patch(
                "app.services.bigbasket.batch_processor.BatchProcessor.retry_single_image",
                new_callable=MagicMock,
            ) as mock_retry:
                async def _fake_retry(*args, **kwargs):
                    return MagicMock()

                mock_retry.side_effect = _fake_retry

                process_single_image_task.request.id = "test-req-1"
                result = process_single_image_task.run(image_id=10, provider="photoroom", skip_classification=False)
                self.assertEqual(result["status"], "success")
                self.assertEqual(result["image_id"], 10)
                mock_session_local.assert_called_once()
                mock_db.close.assert_called_once()

    def test_process_single_image_task_skip_classification(self):
        with patch("app.core.database.SessionLocal") as mock_session_local:
            mock_db = MagicMock()
            mock_session_local.return_value = mock_db

            with patch(
                "app.services.bigbasket.bg_only_processor.BgOnlyProcessor.run",
                new_callable=MagicMock,
            ) as mock_bg_run:
                async def _fake_run(*args, **kwargs):
                    return MagicMock()

                mock_bg_run.side_effect = _fake_run

                process_single_image_task.request.id = "test-req-2"
                result = process_single_image_task.run(image_id=11, provider="birefnet", skip_classification=True)
                self.assertEqual(result["status"], "success")
                self.assertEqual(result["image_id"], 11)
                mock_session_local.assert_called_once()
                mock_db.close.assert_called_once()

    def test_api_retry_dispatches_task(self):
        import asyncio
        from app.api.bigbasket.images import retry_image_processing

        mock_db = MagicMock()
        mock_img = MagicMock()
        mock_img.id = 55
        mock_img.status = "needs_review"
        mock_img.validation_results = {"passed": False}
        mock_db.query.return_value.filter.return_value.first.return_value = mock_img

        with patch("app.tasks.batch_tasks.dispatch_single_image_task") as mock_dispatch:
            res = asyncio.run(retry_image_processing(image_id=55, provider="photoroom", db=mock_db, current_user=MagicMock()))
            self.assertEqual(res.status, "processing")
            mock_dispatch.assert_called_once_with(55, provider="photoroom", skip_classification=False)

    def test_api_bg_remove_dispatches_task(self):
        import asyncio
        from app.api.bigbasket.bg_remove import bg_remove_image

        mock_db = MagicMock()
        mock_img = MagicMock()
        mock_img.id = 77
        mock_img.status = "needs_review"
        mock_img.validation_results = {"passed": False}
        mock_db.query.return_value.filter.return_value.first.return_value = mock_img

        with patch("app.tasks.batch_tasks.dispatch_single_image_task") as mock_dispatch:
            res = asyncio.run(bg_remove_image(image_id=77, provider="birefnet", db=mock_db, current_user=MagicMock()))
            self.assertEqual(res.status, "processing")
            mock_dispatch.assert_called_once_with(77, provider="birefnet", skip_classification=True)


if __name__ == "__main__":
    unittest.main()
