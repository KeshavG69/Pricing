#!/bin/sh
# ---------------------------------------------------------------------------
# Process launcher — one image, selectable role via $SERVICE_ROLE.
#
# This lets the SAME Docker image run as separate Railway services so the web
# server, the Celery worker, and the beat scheduler no longer share one
# container's memory/thread budget. A heavy background job (e.g. the 217 MB
# RFP Radar scan) can then never starve the web process into
# "can't start new thread" on an unrelated request like document upload.
#
# Roles:
#   web          -> FastAPI (uvicorn) only.            [scale freely]
#   worker       -> Celery worker only.                [scale freely]
#   beat         -> Celery beat only.                  [EXACTLY ONE instance]
#   worker-beat  -> worker + beat in one container.    [EXACTLY ONE instance]
#   all          -> web + worker + beat in one box.    [legacy single-service;
#                                                        default for back-compat]
#
# Recommended production split (3 Railway services, same repo/root):
#   web service     SERVICE_ROLE=web
#   worker service  SERVICE_ROLE=worker      (or worker-beat if you run ONE worker)
#   beat service    SERVICE_ROLE=beat        (omit if you used worker-beat)
#
# IMPORTANT: never run more than one `beat` (or `worker-beat`) instance, or the
# daily scan fires multiple times.
#
# Tunables:
#   PORT                 uvicorn port (Railway injects this; default 8000)
#   CELERY_CONCURRENCY   worker child processes (default 1 — raise once the
#                        worker has its own container with enough RAM)
# ---------------------------------------------------------------------------
set -eu

ROLE="${SERVICE_ROLE:-all}"
PORT="${PORT:-8000}"
CELERY_CONCURRENCY="${CELERY_CONCURRENCY:-1}"

echo "[start.sh] SERVICE_ROLE=${ROLE} PORT=${PORT} CELERY_CONCURRENCY=${CELERY_CONCURRENCY}"

run_web() {
  uvicorn app.server:app --host 0.0.0.0 --port "${PORT}"
}

run_worker() {
  celery -A app.worker.celery_app worker --loglevel=info \
    --pool=prefork --concurrency="${CELERY_CONCURRENCY}" --max-tasks-per-child=1
}

case "${ROLE}" in
  web)
    exec uvicorn app.server:app --host 0.0.0.0 --port "${PORT}"
    ;;
  worker)
    exec celery -A app.worker.celery_app worker --loglevel=info \
      --pool=prefork --concurrency="${CELERY_CONCURRENCY}" --max-tasks-per-child=1
    ;;
  beat)
    exec celery -A app.worker.celery_app beat --loglevel=info
    ;;
  worker-beat)
    run_worker &
    exec celery -A app.worker.celery_app beat --loglevel=info
    ;;
  all)
    # Legacy single-container mode: keeps the current single Railway service
    # working unchanged until you create separate web/worker services.
    run_web &
    run_worker &
    exec celery -A app.worker.celery_app beat --loglevel=info
    ;;
  *)
    echo "[start.sh] Unknown SERVICE_ROLE='${ROLE}' (use web|worker|beat|worker-beat|all)" >&2
    exit 1
    ;;
esac
