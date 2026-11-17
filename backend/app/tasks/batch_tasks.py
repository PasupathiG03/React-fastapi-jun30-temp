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
