"""
Unified LLM and Embeddings Client with Thread-Safe Caching

This module provides a unified client for all LLM and embedding operations with:
- Thread-safe singleton pattern with RLock
- Lazy initialization
- Caching to reuse instances per model
- Dual framework support (LangChain + Agno)
- Simplified API
"""

import threading
from typing import Optional, Dict
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from agno.models.openai import OpenAIChat
from app.settings import settings


class LLMClient:
    """Unified LLM and Embeddings client with thread-safe caching"""

    def __init__(self):
        """Initialize LLM client with thread safety"""
        self._lock = threading.RLock()
        self._chat_llm_cache: Dict[str, ChatOpenAI] = {}
        self._chat_llm_agno_cache: Dict[str, OpenAIChat] = {}
        self._embeddings_cache: Dict[str, OpenAIEmbeddings] = {}

    def get_chat_llm(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None
    ) -> ChatOpenAI:
        """
        Get ChatOpenAI instance for structured output and chat operations (LangChain)

        Args:
            model: Model name (defaults to settings.OPENROUTER_MODEL)
            api_key: API key (defaults to settings.OPENROUTER_API_KEY)
            base_url: Base URL (defaults to OpenRouter)

        Returns:
            ChatOpenAI instance
        """
        model = model or settings.OPENROUTER_MODEL
        api_key = api_key or settings.OPENROUTER_API_KEY
        base_url = base_url or "https://openrouter.ai/api/v1"

        cache_key = f"{model}:{base_url}"

        with self._lock:
            if cache_key not in self._chat_llm_cache:
                self._chat_llm_cache[cache_key] = ChatOpenAI(
                    model=model,
                    openai_api_key=api_key,
                    openai_api_base=base_url,
                )
            return self._chat_llm_cache[cache_key]

    def get_chat_llm_agno(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None
    ) -> OpenAIChat:
        """
        Get OpenAIChat instance for Agno framework operations

        Args:
            model: Model name (defaults to settings.OPENROUTER_MODEL)
            api_key: API key (defaults to settings.OPENROUTER_API_KEY)
            base_url: Base URL (defaults to OpenRouter)

        Returns:
            OpenAIChat instance
        """
        model = model or settings.OPENROUTER_MODEL
        api_key = api_key or settings.OPENROUTER_API_KEY
        base_url = base_url or "https://openrouter.ai/api/v1"

        cache_key = f"{model}:{base_url}"

        with self._lock:
            if cache_key not in self._chat_llm_agno_cache:
                self._chat_llm_agno_cache[cache_key] = OpenAIChat(
                    id=model,
                    api_key=api_key,
                    base_url=base_url,
                )
            return self._chat_llm_agno_cache[cache_key]

    def get_embeddings(
        self
    ) -> OpenAIEmbeddings:
        """
        Get OpenAI embeddings instance for vector search

        Args:
            model: Model name (defaults to text-embedding-3-small)
            api_key: API key (defaults to settings.OPENAI_API_KEY)

        Returns:
            OpenAIEmbeddings instance
        """
        model =  "openai/text-embedding-3-small"
        api_key =  settings.OPENROUTER_API_KEY

        cache_key = model

        with self._lock:
            if cache_key not in self._embeddings_cache:
                self._embeddings_cache[cache_key] = OpenAIEmbeddings(
                    openai_api_key=api_key,
                    model=model,
                    dimensions=1536,
                    request_timeout=60,  # 60 second timeout
                    base_url="https://openrouter.ai/api/v1",
                    max_retries=3  # Retry up to 3 times
                )
            return self._embeddings_cache[cache_key]

    def clear_cache(self) -> None:
        """Clear all cached instances"""
        with self._lock:
            self._chat_llm_cache.clear()
            self._chat_llm_agno_cache.clear()
            self._embeddings_cache.clear()


# Global LLM client (singleton pattern)
_llm_client: Optional[LLMClient] = None
_client_lock = threading.RLock()


def get_llm_client() -> LLMClient:
    """
    Get or create LLM client (singleton pattern)

    Returns:
        LLMClient instance
    """
    global _llm_client
    with _client_lock:
        if _llm_client is None:
            _llm_client = LLMClient()
        return _llm_client


def get_chat_llm(
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
) -> ChatOpenAI:
    """
    Convenience function to get ChatOpenAI instance directly (LangChain)

    Args:
        model: Model name (defaults to settings.OPENROUTER_MODEL)
        api_key: API key (defaults to settings.OPENROUTER_API_KEY)
        base_url: Base URL (defaults to OpenRouter)

    Returns:
        ChatOpenAI instance
    """
    return get_llm_client().get_chat_llm(model=model, api_key=api_key, base_url=base_url)


def get_chat_llm_agno(
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
) -> OpenAIChat:
    """
    Convenience function to get OpenAIChat instance directly (Agno)

    Args:
        model: Model name (defaults to settings.OPENROUTER_MODEL)
        api_key: API key (defaults to settings.OPENROUTER_API_KEY)
        base_url: Base URL (defaults to OpenRouter)

    Returns:
        OpenAIChat instance
    """
    return get_llm_client().get_chat_llm_agno(model=model, api_key=api_key, base_url=base_url)


def get_embeddings() -> OpenAIEmbeddings:
    """
    Convenience function to get OpenAI embeddings instance directly

    Returns:
        OpenAIEmbeddings instance (text-embedding-3-small)
    """
    return get_llm_client().get_embeddings()


def clear_llm_cache() -> None:
    """Convenience function to clear all cached LLM instances"""
    client = get_llm_client()
    client.clear_cache()
