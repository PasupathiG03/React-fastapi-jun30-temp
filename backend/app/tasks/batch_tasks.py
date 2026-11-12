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

