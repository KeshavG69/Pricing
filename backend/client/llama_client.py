"""Singleton LlamaExtract client for document extraction."""

import os
import threading
from typing import Optional

from app.settings import settings

try:
    from llama_cloud_services import LlamaExtract
except ImportError:
    raise ImportError(
        "llama-cloud-services not installed. "
        "Run: pip install llama-cloud-services"
    )

# Singleton instance and lock
_llama_extract_instance: Optional[LlamaExtract] = None
_lock = threading.Lock()


def get_llama_extract(
    httpx_timeout: float = 300.0,
    max_timeout: int = 3000
) -> LlamaExtract:
    """
    Get singleton LlamaExtract instance.

    Thread-safe initialization with lazy loading.
    Checks DISABLE_SSL_VERIFY env var for development mode.

    Args:
        httpx_timeout: HTTP request timeout in seconds (default 5 minutes)
        max_timeout: Max wait time for extraction job in seconds (default 50 minutes)

    Returns:
        LlamaExtract instance
    """
    global _llama_extract_instance

    if _llama_extract_instance is None:
        with _lock:
            # Double-check locking pattern
            if _llama_extract_instance is None:
                api_key = settings.LLAMA_CLOUD_API_KEY
                if not api_key:
                    raise ValueError("LLAMA_CLOUD_API_KEY not found")

                disable_ssl = os.getenv("DISABLE_SSL_VERIFY", "false").lower() == "true"

                if disable_ssl:
                    print("  [LlamaExtract] Creating singleton instance (SSL disabled)")
                    _llama_extract_instance = LlamaExtract(
                        api_key=api_key,
                        httpx_timeout=httpx_timeout,
                        max_timeout=max_timeout,
                        verify=False
                    )
                else:
                    print("  [LlamaExtract] Creating singleton instance")
                    _llama_extract_instance = LlamaExtract(
                        api_key=api_key,
                        httpx_timeout=httpx_timeout,
                        max_timeout=max_timeout
                    )

    return _llama_extract_instance
