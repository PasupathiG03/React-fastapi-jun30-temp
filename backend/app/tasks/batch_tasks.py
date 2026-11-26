import asyncio
from app.core.celery_app import celery_app
from app.core.logger import logger
from app.services.bigbasket.batch_processor import BatchProcessor


@celery_app.task(bind=True, name="tasks.process_batch_task")
def process_batch_task(self, batch_id: int):
    """Celery background worker task for executing an entire image batch.

    Runs inside a dedicated Celery worker process, leaving Uvicorn's event loop
    and HTTP handling 100% unblocked and responsive.
    """
    task_id = self.request.id
    logger.info(f"[Celery] Worker started batch processing for batch_id={batch_id} (Task ID: {task_id})")
    try:
        # Run the batch processor asynchronously within this worker process's isolated event loop
        asyncio.run(BatchProcessor.process_batch_background(batch_id))
        logger.info(f"[Celery] Worker completed batch processing for batch_id={batch_id} (Task ID: {task_id})")
        return {"status": "success", "batch_id": batch_id, "task_id": task_id}
    except Exception as exc:
        logger.exception(f"[Celery] Worker failed processing batch_id={batch_id} (Task ID: {task_id}): {exc}")
        raise exc


@celery_app.task(bind=True, name="tasks.process_single_image_task")
def process_single_image_task(
    self,
    image_id: int,
    provider: str = "photoroom",
    skip_classification: bool = False,
):
    """Celery background worker task for processing or retrying a single image.

    Runs inside a dedicated Celery worker thread/process, leaving Uvicorn unblocked.
    Supports concurrent multi-processing across different images and batches.
    """
    task_id = self.request.id
    logger.info(
        f"[Celery] Worker started single image task for image_id={image_id}, "
        f"provider={provider}, skip_classification={skip_classification} (Task ID: {task_id})"
    )
    try:
        from app.core.database import SessionLocal
        from app.services.bigbasket.bg_only_processor import BgOnlyProcessor

        async def _run():
            db = SessionLocal()
            try:
                if skip_classification:
                    await BgOnlyProcessor.run(db, image_id, provider=provider)
                else:
                    await BatchProcessor.retry_single_image(db, image_id, provider=provider)
            finally:
                db.close()

        asyncio.run(_run())
        logger.info(f"[Celery] Worker completed single image task for image_id={image_id} (Task ID: {task_id})")
        return {"status": "success", "image_id": image_id, "task_id": task_id}
    except Exception as exc:
        logger.exception(f"[Celery] Worker failed single image task for image_id={image_id} (Task ID: {task_id}): {exc}")
        raise exc


def dispatch_single_image_task(
    image_id: int,
    provider: str = "photoroom",
    skip_classification: bool = False,
):
    """Dispatches single image processing to Celery background worker if available.
    Falls back gracefully to a detached daemon thread so Uvicorn's asyncio event loop
    is NEVER blocked even if Redis/Celery is temporarily offline.
    """
    dispatched = False
    try:
        task = process_single_image_task.delay(
            image_id, provider=provider, skip_classification=skip_classification
        )
        logger.info(f"Dispatched image {image_id} to Celery worker (Task ID: {task.id})")
        dispatched = True
    except Exception as exc:
        logger.warning(f"Celery dispatch failed for image {image_id} ({exc}); falling back to background thread.")

    if not dispatched:
        import threading
        from app.core.database import SessionLocal
        from app.services.bigbasket.bg_only_processor import BgOnlyProcessor

        def _run_in_thread():
            async def _run():
                db = SessionLocal()
                try:
                    if skip_classification:
                        await BgOnlyProcessor.run(db, image_id, provider=provider)
                    else:
                        await BatchProcessor.retry_single_image(db, image_id, provider=provider)
                finally:
                    db.close()

            asyncio.run(_run())

        t = threading.Thread(target=_run_in_thread, daemon=True, name=f"img-thread-{image_id}")
        t.start()
        logger.info(f"Started image {image_id} in detached daemon thread.")


def recover_interrupted_tasks():
    """Re-queues batches and individual images that were left in 'processing'/'queued' when the server or worker restarted."""
    from app.core.database import SessionLocal
    from app.models.bigbasket import BatchImage, ImageBatch
    from app.services.bigbasket.events import redis_usable

    # In multi-worker deployments (--workers 4), only one worker should run recovery per startup.
    acquired = BatchProcessor._redis_call(
        lambda r: r.set("startup:recover_interrupted_tasks", "1", nx=True, ex=60),
        force=False,
    )
    if redis_usable() and not acquired:
        return

    db = SessionLocal()
    try:
        active_batches = (
            db.query(ImageBatch)
            .filter(ImageBatch.status.in_(["queued", "processing"]))
            .all()
        )
        active_batch_ids = set()
        for batch in active_batches:
            active_batch_ids.add(batch.id)
            stuck_imgs = (
                db.query(BatchImage)
                .filter(
                    BatchImage.batch_id == batch.id,
                    BatchImage.status == "processing",
                )
                .all()
            )
            for img in stuck_imgs:
                img.status = "pending"
            db.commit()
            try:
                process_batch_task.delay(batch.id)
                logger.info(f"[Startup Recovery] Re-queued interrupted batch {batch.id} ({batch.batch_code}).")
            except Exception as exc:
                logger.warning(f"[Startup Recovery] Failed to re-queue batch {batch.id}: {exc}")

        # Re-dispatch any standalone image reruns stuck in 'processing' outside active batches
        orphan_query = db.query(BatchImage).filter(BatchImage.status == "processing")
        if active_batch_ids:
            orphan_query = orphan_query.filter(~BatchImage.batch_id.in_(active_batch_ids))
        orphans = orphan_query.all()
        for img in orphans:
            provider = ((img.batch.config if img.batch else None) or {}).get("bg_removal_provider") or "birefnet"
            dispatch_single_image_task(img.id, provider=provider, skip_classification=False)
            logger.info(f"[Startup Recovery] Re-dispatched interrupted image {img.id} (provider={provider}).")
    except Exception as exc:
        logger.warning(f"[Startup Recovery] Error checking interrupted tasks: {exc}")
    finally:
        db.close()
