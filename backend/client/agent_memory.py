"""
Agent Memory Manager

Provides persistent storage for agent conversations and user memories.
Uses MongoDB for storing sessions, memories, and metrics.
"""

import threading
from typing import Optional
from agno.db.mongo import MongoDb
from agno.memory.manager import MemoryManager
from app.settings import settings


class AgentMemoryManager:
    """
    Singleton manager for agent memory storage.
    Provides thread-safe lazy initialization for MongoDB connections.
    """

    _instance: Optional['AgentMemoryManager'] = None
    _lock = threading.Lock()

    def __new__(cls) -> 'AgentMemoryManager':
        """Ensure only one instance exists (singleton pattern)."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """Initialize caches for db and memory manager."""
        if hasattr(self, '_initialized') and self._initialized:
            return

        self._db_cache: Optional[MongoDb] = None
        self._memory_manager_cache: Optional[MemoryManager] = None
        self._db_lock = threading.Lock()
        self._memory_lock = threading.Lock()
        self._initialized = True

    def get_db(self) -> MongoDb:
        """
        Get or create a shared MongoDb instance for agent storage.

        Returns:
            MongoDb instance configured for agent sessions, memory, and metrics
        """
        if self._db_cache is None:
            with self._db_lock:
                if self._db_cache is None:
                    print("Initializing MongoDb instance for agent storage")
                    self._db_cache = MongoDb(
                        db_url=settings.MONGODB_URL,
                        db_name=settings.MONGODB_DATABASE,
                        session_collection="agent_sessions",
                        memory_collection="agent_memory",
                        metrics_collection="agent_metrics",
                        eval_collection="agent_eval_runs",
                        knowledge_collection="agent_knowledge",
                    )
        return self._db_cache

    def get_memory_manager(self) -> MemoryManager:
        """
        Get or create a memory manager for agent conversations.

        Returns:
            MemoryManager instance with MongoDB backend
        """
        if self._memory_manager_cache is None:
            with self._memory_lock:
                if self._memory_manager_cache is None:
                    print("Initializing agent memory manager")
                    self._memory_manager_cache = MemoryManager(
                        db=self.get_db(),
                        memory_capture_instructions="""
Focus on capturing important information from user interactions:

HELP CENTER CONTEXT:
- Topics the user is asking about (e.g., pricing, proposals, uploads)
- Specific features they're trying to use
- Problems they're encountering
- Their level of familiarity with the platform

USER PREFERENCES:
- Preferred communication style (detailed vs concise)
- Types of questions they typically ask
- Areas where they need more help

INTERACTION HISTORY:
- Previously asked questions to avoid repetition
- Successfully resolved issues
- Follow-up questions or related topics
- Recurring themes in their queries

Remember to:
- Focus on facts, not assumptions
- Capture relevant technical details
- Track their learning journey with the platform
- Note any persistent confusion or difficulties
"""
                    )
        return self._memory_manager_cache


# Global singleton instance
_agent_memory_manager: Optional[AgentMemoryManager] = None
_manager_lock = threading.Lock()


def get_agent_memory_manager() -> AgentMemoryManager:
    """Get the global agent memory manager singleton."""
    global _agent_memory_manager
    if _agent_memory_manager is None:
        with _manager_lock:
            if _agent_memory_manager is None:
                _agent_memory_manager = AgentMemoryManager()
    return _agent_memory_manager


def get_agent_db() -> MongoDb:
    """Convenience function to get MongoDB instance."""
    return get_agent_memory_manager().get_db()


def get_memory_manager() -> MemoryManager:
    """Convenience function to get memory manager."""
    return get_agent_memory_manager().get_memory_manager()
