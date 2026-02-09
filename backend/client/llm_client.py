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
        max_tokens: Optional[int] = None,
        base_url: Optional[str] = None
    ) -> ChatOpenAI:
        """
        Get ChatOpenAI instance for structured output and chat operations (LangChain)

        Args:
            model: Model name (defaults to Claude Sonnet 4.5)
            api_key: API key (defaults to settings.CLAUDE_API_KEY)
            base_url: Base URL (defaults to Claude)
            max_tokens: Maximum tokens (defaults to 10000, ignored for GPT-5 models)

        Returns:
            ChatOpenAI instance
        """
        model = model or "claude-sonnet-4-5"
        api_key = api_key or settings.CLAUDE_API_KEY
        base_url = base_url or settings.CLAUDE_BASE_URL

        # Check if model is GPT-5 (gpt-5, gpt-5-mini, gpt-5-turbo, etc.)
        is_gpt5 = model.lower().startswith("gpt-5")

        # Adjust cache key based on whether max_tokens is used
        if is_gpt5:
            cache_key = f"{model}:{base_url}"
        else:
            cache_key = f"{model}:{base_url}:{max_tokens}"

        with self._lock:
            if cache_key not in self._chat_llm_cache:
                # Build kwargs dynamically
                llm_kwargs = {
                    "model": model,
                    "openai_api_key": api_key,
                    "openai_api_base": base_url
                }

                # Only add max_tokens if NOT GPT-5
                if not is_gpt5 and max_tokens is not None:
                    llm_kwargs["max_tokens"] = max_tokens

                self._chat_llm_cache[cache_key] = ChatOpenAI(**llm_kwargs)
            return self._chat_llm_cache[cache_key]

    def get_chat_llm_agno(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = 0.1
    ) -> OpenAIChat:
        """
        Get OpenAIChat instance for Agno framework operations

        Args:
            model: Model name (defaults to Claude Sonnet 4.5)
            api_key: API key (defaults to settings.CLAUDE_API_KEY)
            base_url: Base URL (defaults to Claude)
            temperature: Sampling temperature (defaults to 0.1, ignored for GPT-5 models)
            max_tokens: Maximum tokens (defaults to 10000, ignored for GPT-5 models)

        Returns:
            OpenAIChat instance
        """
        model = model or "claude-sonnet-4-5"
        api_key = api_key or settings.CLAUDE_API_KEY
        base_url = base_url or settings.CLAUDE_BASE_URL
        max_tokens = max_tokens or 10000
        temperature = temperature if temperature is not None else 0.1

        # Check if model is GPT-5 (gpt-5, gpt-5-mini, gpt-5-turbo, etc.)
        is_gpt5 = model.lower().startswith("gpt-5")

        # Adjust cache key based on whether params are used
        if is_gpt5:
            cache_key = f"{model}:{base_url}"
        else:
            cache_key = f"{model}:{base_url}:{max_tokens}:{temperature}"

        with self._lock:
            if cache_key not in self._chat_llm_agno_cache:
                # Build kwargs dynamically
                llm_kwargs = {
                    "id": model,
                    "api_key": api_key,
                    "base_url": base_url
                }

                # Only add max_tokens and temperature if NOT GPT-5
                if not is_gpt5:
                    llm_kwargs["max_tokens"] = max_tokens
                    llm_kwargs["temperature"] = temperature

                self._chat_llm_agno_cache[cache_key] = OpenAIChat(**llm_kwargs)
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
        model =  "text-embedding-3-small"
        api_key =  settings.OPENAI_API_KEY

        cache_key = model

        with self._lock:
            if cache_key not in self._embeddings_cache:
                self._embeddings_cache[cache_key] = OpenAIEmbeddings(
                    openai_api_key=api_key,
                    model=model,
                    dimensions=1536,
                    request_timeout=60,  # 60 second timeout
                    
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
    base_url: Optional[str] = None,
    max_tokens: Optional[int] = None
) -> ChatOpenAI:
    """
    Convenience function to get ChatOpenAI instance directly (LangChain)

    Args:
        model: Model name (defaults to Claude Sonnet 4.5)
        api_key: API key (defaults to settings.CLAUDE_API_KEY)
        base_url: Base URL (defaults to Claude)
        max_tokens: Maximum tokens (defaults to 10000)

    Returns:
        ChatOpenAI instance
    """
    return get_llm_client().get_chat_llm(model=model, api_key=api_key, base_url=base_url,max_tokens=max_tokens)


def get_chat_llm_agno(
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: Optional[float] = 0.1
) -> OpenAIChat:
    """
    Convenience function to get OpenAIChat instance directly (Agno)

    Args:
        model: Model name (defaults to Claude Sonnet 4.5)
        api_key: API key (defaults to settings.CLAUDE_API_KEY)
        base_url: Base URL (defaults to Claude)
        temperature: Sampling temperature (defaults to 0.1)
        max_tokens: Maximum tokens (defaults to 10000)

    Returns:
        OpenAIChat instance
    """
    return get_llm_client().get_chat_llm_agno(model=model, api_key=api_key, base_url=base_url,max_tokens=max_tokens, temperature=temperature)


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
