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

# Create data directory structure
RUN mkdir -p data/cache data/oews

# Download occupation file for FAISS index (~260KB)
# BLS server requires proper User-Agent header to avoid 403 Forbidden
RUN curl -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    -H "Accept: */*" \
    -o data/oews/oe.occupation \
    https://download.bls.gov/pub/time.series/oe/oe.occupation && \
    head -1 data/oews/oe.occupation | grep -q "occupation_code" || \
    (echo "ERROR: Failed to download valid occupation file" && exit 1)

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Expose port (Railway assigns dynamically via PORT env var)
EXPOSE 8000

# Run the application with uvicorn using Railway's PORT
CMD uvicorn app.server:app --host 0.0.0.0 --port ${PORT:-8000}
