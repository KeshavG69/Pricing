# syntax=docker/dockerfile:1

FROM python:3.13-slim

# Install minimal system dependencies
# faiss-cpu requires: libgomp1
# healthcheck requires: curl
# liteparse requires: nodejs (>= 18)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    libreoffice-core \
    libreoffice-calc \
    libreoffice-writer \
    libreoffice-impress \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @llamaindex/liteparse \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Create non-root user for security
RUN useradd -m -u 1000 appuser

# Set working directory
WORKDIR /app

# Enable bytecode compilation for better performance
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Copy dependency files
COPY pyproject.toml ./

# Install dependencies using uv
# --no-dev excludes development dependencies
RUN uv sync --no-dev

# Copy application code
COPY --chown=appuser:appuser . .

# Create data directory structure (oe.occupation is bundled via COPY . . above)
RUN mkdir -p data/cache data/oews

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Expose port
EXPOSE 8000


# Entrypoint is start.sh, which selects what to run from $SERVICE_ROLE:
#   web | worker | beat | worker-beat | all  (default: all)
#
# Default `all` runs uvicorn + worker + beat in one container — backward
# compatible with a single Railway service. To stop a heavy background job
# from starving the web process (the "can't start new thread" outage), split
# into separate Railway services that share this image and Redis:
#   web service     SERVICE_ROLE=web      (Railway provides $PORT)
#   worker service  SERVICE_ROLE=worker   (no public domain / healthcheck)
#   beat service    SERVICE_ROLE=beat     (EXACTLY ONE instance)
# Or fold beat into a single worker with SERVICE_ROLE=worker-beat.
#
# NEVER run more than one beat (or worker-beat) instance, or scheduled jobs
# fire multiple times. Beat's schedule state lives at /app/celerybeat-schedule
# (lost on restart, fine for a daily cron).
CMD ["sh", "start.sh"]
