# syntax=docker/dockerfile:1

FROM python:3.13-slim

# Install minimal system dependencies
# faiss-cpu requires: libgomp1
# healthcheck requires: curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
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

# Create empty data directory structure (will be populated at runtime)
RUN mkdir -p data/cache

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Expose port (Railway assigns dynamically via PORT env var)
EXPOSE 8000

# Health check using dynamic PORT
HEALTHCHECK CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Run the application with uvicorn using Railway's PORT
CMD uvicorn app.server:app --host 0.0.0.0 --port ${PORT:-8000}
