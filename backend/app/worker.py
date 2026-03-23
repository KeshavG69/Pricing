"""
Celery Worker Configuration
Handles background task processing for proposal and GSA contract ingestion.
"""

import logging
import sys
from pathlib import Path

# Ensure the backend directory is on the Python path so all modules are importable
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from celery import Celery
from app.settings import settings

logger = logging.getLogger(__name__)


def build_redis_url(db: int) -> str:
    """Build Redis URL with optional authentication."""
    if settings.REDIS_PASSWORD:
        return f"redis://:{settings.REDIS_PASSWORD}@{settings.REDIS_HOST}:{settings.REDIS_PORT}/{db}"
    return f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/{db}"


celery_app = Celery(
    "priceiq_worker",
    broker=build_redis_url(0),
    backend=build_redis_url(1),
)

# Import task modules to register them with Celery
import tasks.processing_tasks  # noqa: E402, F401

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,        # 1 hour max per task
    task_soft_time_limit=3000,   # 50 minutes soft limit
    task_acks_late=True,         # Acknowledge after task completes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1,  # Restart worker after each task to free resources
    worker_pool_restarts=True,
)
