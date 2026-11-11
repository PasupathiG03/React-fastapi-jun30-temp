import os
from celery import Celery
from app.core.config import settings

# Import all models to ensure SQLAlchemy mapper registry is fully initialized
import app.models  # noqa: F401

broker_url = settings.CELERY_BROKER_URL
result_backend = settings.CELERY_RESULT_BACKEND

celery_app = Celery(
    "pulse_tasks",
    broker=broker_url,
    backend=result_backend,
    include=["app.tasks.batch_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
)

if __name__ == "__main__":
    celery_app.start()

