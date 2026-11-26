"""Unit test for automatic startup recovery of interrupted batches and single images."""
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.bigbasket import BatchImage, ImageBatch
from app.models.user import User
from app.tasks import batch_tasks


class StartupRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[User.__table__, ImageBatch.__table__, BatchImage.__table__],
        )
        self.TestSession = sessionmaker(bind=self.engine)

    def test_recovers_interrupted_batch_and_standalone_image(self):
        db = self.TestSession()
        b_active = ImageBatch(
            batch_code="B-ACTIVE",
            name="Active",
            source_type="zip_upload",
            status="processing",
            total_images=2,
        )
        b_done = ImageBatch(
            batch_code="B-DONE",
            name="Done",
            source_type="zip_upload",
            status="completed",
            total_images=1,
        )
        db.add_all([b_active, b_done])
        db.flush()

        img_stuck = BatchImage(
            batch_id=b_active.id,
            bbid="SKU1",
            original_filename="1.jpg",
            original_file_path="1.jpg",
            sequence_order=1,
            status="processing",
        )
        img_ok = BatchImage(
            batch_id=b_active.id,
            bbid="SKU1",
            original_filename="2.jpg",
            original_file_path="2.jpg",
            sequence_order=2,
            status="auto_approved",
        )
        img_orphan = BatchImage(
            batch_id=b_done.id,
            bbid="SKU2",
            original_filename="3.jpg",
            original_file_path="3.jpg",
            sequence_order=1,
            status="processing",
        )
        db.add_all([img_stuck, img_ok, img_orphan])
        db.commit()
        b_active_id, img_stuck_id, img_ok_id, img_orphan_id = (
            b_active.id,
            img_stuck.id,
            img_ok.id,
            img_orphan.id,
        )
        db.close()

        queued_batches = []
        dispatched_orphans = []

        with (
            patch("app.core.database.SessionLocal", self.TestSession),
            patch("app.services.bigbasket.events.redis_usable", return_value=False),
            patch.object(batch_tasks.BatchProcessor, "_redis_call", return_value=None),
            patch.object(
                batch_tasks.process_batch_task,
                "delay",
                side_effect=lambda bid: queued_batches.append(bid),
            ),
            patch.object(
                batch_tasks,
                "dispatch_single_image_task",
                side_effect=lambda iid, **kw: dispatched_orphans.append((iid, kw)),
            ),
        ):
            batch_tasks.recover_interrupted_tasks()

        verify_db = self.TestSession()
        self.assertEqual(verify_db.get(BatchImage, img_stuck_id).status, "pending")
        self.assertEqual(verify_db.get(BatchImage, img_ok_id).status, "auto_approved")
        self.assertEqual(verify_db.get(BatchImage, img_orphan_id).status, "processing")
        verify_db.close()

        self.assertEqual(queued_batches, [b_active_id])
        self.assertEqual(
            dispatched_orphans,
            [(img_orphan_id, {"provider": "birefnet", "skip_classification": False})],
        )

    def test_skips_when_redis_lock_already_held(self):
        db = self.TestSession()
        b_active = ImageBatch(
            batch_code="B-ACTIVE",
            name="Active",
            source_type="zip_upload",
            status="processing",
            total_images=1,
        )
        db.add(b_active)
        db.commit()
        db.close()

        queued_batches = []
        with (
            patch("app.core.database.SessionLocal", self.TestSession),
            patch("app.services.bigbasket.events.redis_usable", return_value=True),
            patch.object(batch_tasks.BatchProcessor, "_redis_call", return_value=False),
            patch.object(
                batch_tasks.process_batch_task,
                "delay",
                side_effect=lambda bid: queued_batches.append(bid),
            ),
        ):
            batch_tasks.recover_interrupted_tasks()

        self.assertEqual(queued_batches, [])


if __name__ == "__main__":
    unittest.main()

