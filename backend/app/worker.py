"""
Celery Worker Configuration
Handles background task processing for proposal and GSA contract ingestion.
"""

import logging
import socket
import sys
from pathlib import Path

# Ensure the backend directory is on the Python path so all modules are importable
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from celery import Celery
from celery.schedules import crontab
from app.settings import settings

logger = logging.getLogger(__name__)


celery_app = Celery(
    "priceiq_worker",
    broker=f"{settings.REDIS_URL.rstrip('/')}/0",
    backend=f"{settings.REDIS_URL.rstrip('/')}/1",
)

# Import task modules to register them with Celery
import tasks.processing_tasks  # noqa: E402, F401
import tasks.rfp_radar_scanner  # noqa: E402, F401

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


# ---------------------------------------------------------------------------
# Beat schedule (scheduled tasks)
# ---------------------------------------------------------------------------
#
# Run this alongside the worker:
#   celery -A app.worker beat       # the alarm clock
#   celery -A app.worker worker     # the worker (processes the jobs)
#
# Trigger a scheduled job manually for testing:
#   celery -A app.worker call rfp_radar.daily_scan

celery_app.conf.beat_schedule = {
    # RFP Radar daily scan — produces top-10 matches per org per day.
    # 10:00 UTC ≈ 06:00 ET (EDT) / 05:00 ET (EST). SAM.gov refreshes its
    # bulk CSV at ~03:30 UTC, so 10:00 gives a 6.5-hour buffer for any
    # delays on their side.
    "rfp-radar-daily-scan": {
        "task": "rfp_radar.daily_scan",
        "schedule": crontab(hour=10, minute=0),
    },
}
