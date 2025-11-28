# syntax=docker/dockerfile:1

FROM python:3.13-slim

# Install system dependencies required by Python packages
# unstructured requires: libmagic1, poppler-utils, tesseract-ocr, libreoffice, pandoc
# faiss-cpu requires: libgomp1
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libmagic1 \
    poppler-utils \
    tesseract-ocr \
    libreoffice \
    pandoc \
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

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application with uvicorn
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8000"]
