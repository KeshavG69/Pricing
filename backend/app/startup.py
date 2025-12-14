"""
Startup manager for pre-warming expensive clients at server startup.

This module pre-initializes clients that have expensive cold starts:
- SOC Vector Search (~30s): FAISS index loading + embedding generation
- LLM Embeddings (~2-5s): OpenAI client initialization
- MongoDB connections (~1-2s each): Auth and OEWS databases

Pre-warming these clients at startup reduces first request latency from ~30s to <100ms.
"""

import asyncio
import time
import logging
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class StartupManager:
    """
    Manages pre-warming of expensive clients at server startup.

    Thread-safe singleton that tracks pre-warming status and timing.
    """

    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(StartupManager, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.warmup_status: Dict[str, Dict] = {
            "soc_vector_search": {
                "status": "pending",
                "duration_ms": None,
                "error": None,
                "started_at": None,
                "completed_at": None
            },
            "llm_embeddings": {
                "status": "pending",
                "duration_ms": None,
                "error": None,
                "started_at": None,
                "completed_at": None
            },
            "mongodb_auth": {
                "status": "pending",
                "duration_ms": None,
                "error": None,
                "started_at": None,
                "completed_at": None
            },
            "mongodb_oews": {
                "status": "pending",
                "duration_ms": None,
                "error": None,
                "started_at": None,
                "completed_at": None
            }
        }
        self.overall_status = "pending"  # pending, in_progress, completed, failed
        self.total_duration_ms: Optional[float] = None
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None

        self.__class__._initialized = True

    async def prewarm_soc_vector_search(self) -> float:
        """
        Pre-warm SOC Vector Search client (most expensive operation).

        Initializes FAISS index, loads embeddings, and runs test search.

        Returns:
            Duration in milliseconds
        """
        client_name = "soc_vector_search"
        logger.info(f"[PREWARM] Starting {client_name}...")

        self.warmup_status[client_name]["status"] = "in_progress"
        self.warmup_status[client_name]["started_at"] = datetime.utcnow().isoformat()

        start_time = time.time()

        try:
            # Import here to avoid circular dependencies
            from client.soc_vector_search import get_soc_vector_search_client

            # Initialize client (loads FAISS index)
            client = get_soc_vector_search_client()

            # Run test search to ensure everything is loaded
            test_results = client.search("Software Developer", top_k=1)

            duration_ms = (time.time() - start_time) * 1000

            self.warmup_status[client_name]["status"] = "completed"
            self.warmup_status[client_name]["duration_ms"] = round(duration_ms, 2)
            self.warmup_status[client_name]["completed_at"] = datetime.utcnow().isoformat()

            logger.info(f"[PREWARM] ✓ {client_name} completed in {duration_ms:.0f}ms")
            logger.info(f"[PREWARM] Test search returned {len(test_results)} results")

            return duration_ms

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = str(e)

            self.warmup_status[client_name]["status"] = "failed"
            self.warmup_status[client_name]["duration_ms"] = round(duration_ms, 2)
            self.warmup_status[client_name]["error"] = error_msg
            self.warmup_status[client_name]["completed_at"] = datetime.utcnow().isoformat()

            logger.error(f"[PREWARM] ✗ {client_name} failed after {duration_ms:.0f}ms: {error_msg}")

            return duration_ms

    async def prewarm_llm_embeddings(self) -> float:
        """
        Pre-warm LLM embeddings client.

        Initializes OpenAI client and runs test embedding.

        Returns:
            Duration in milliseconds
        """
        client_name = "llm_embeddings"
        logger.info(f"[PREWARM] Starting {client_name}...")

        self.warmup_status[client_name]["status"] = "in_progress"
        self.warmup_status[client_name]["started_at"] = datetime.utcnow().isoformat()

        start_time = time.time()

        try:
            # Import here to avoid circular dependencies
            from client.llm_client import get_embeddings

            # Initialize embeddings client
            embeddings = get_embeddings()

            # Run test embedding
            test_embedding = embeddings.embed_query("test")

            duration_ms = (time.time() - start_time) * 1000

            self.warmup_status[client_name]["status"] = "completed"
            self.warmup_status[client_name]["duration_ms"] = round(duration_ms, 2)
            self.warmup_status[client_name]["completed_at"] = datetime.utcnow().isoformat()

            logger.info(f"[PREWARM] ✓ {client_name} completed in {duration_ms:.0f}ms")
            logger.info(f"[PREWARM] Test embedding dimension: {len(test_embedding)}")

            return duration_ms

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = str(e)

            self.warmup_status[client_name]["status"] = "failed"
            self.warmup_status[client_name]["duration_ms"] = round(duration_ms, 2)
            self.warmup_status[client_name]["error"] = error_msg
            self.warmup_status[client_name]["completed_at"] = datetime.utcnow().isoformat()

            logger.error(f"[PREWARM] ✗ {client_name} failed after {duration_ms:.0f}ms: {error_msg}")

            return duration_ms

    async def prewarm_mongodb_auth(self) -> float:
        """
        Pre-warm MongoDB auth database connection.

        Connects and pings auth database.

        Returns:
            Duration in milliseconds
        """
        client_name = "mongodb_auth"
        logger.info(f"[PREWARM] Starting {client_name}...")

        self.warmup_status[client_name]["status"] = "in_progress"
        self.warmup_status[client_name]["started_at"] = datetime.utcnow().isoformat()

        start_time = time.time()

        try:
            # Import here to avoid circular dependencies
            from auth.database import get_mongodb_client

            # Get database and ping (sync operations)
            mongodb = get_mongodb_client()
            db = mongodb.get_database()
            db.command('ping')

            duration_ms = (time.time() - start_time) * 1000

            self.warmup_status[client_name]["status"] = "completed"
            self.warmup_status[client_name]["duration_ms"] = round(duration_ms, 2)
            self.warmup_status[client_name]["completed_at"] = datetime.utcnow().isoformat()

            logger.info(f"[PREWARM] ✓ {client_name} completed in {duration_ms:.0f}ms")

            return duration_ms

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = str(e)

            self.warmup_status[client_name]["status"] = "failed"
            self.warmup_status[client_name]["duration_ms"] = round(duration_ms, 2)
            self.warmup_status[client_name]["error"] = error_msg
            self.warmup_status[client_name]["completed_at"] = datetime.utcnow().isoformat()

            logger.error(f"[PREWARM] ✗ {client_name} failed after {duration_ms:.0f}ms: {error_msg}")

            return duration_ms

    async def prewarm_mongodb_oews(self) -> float:
        """
        Pre-warm MongoDB OEWS database connection.

        Connects and pings OEWS database.

        Returns:
            Duration in milliseconds
        """
        client_name = "mongodb_oews"
        logger.info(f"[PREWARM] Starting {client_name}...")

        self.warmup_status[client_name]["status"] = "in_progress"
        self.warmup_status[client_name]["started_at"] = datetime.utcnow().isoformat()

        start_time = time.time()

        try:
            # Import here to avoid circular dependencies
            from client.oews_mongodb import get_oews_mongo_client

            # Get client instance and run test query
            client = get_oews_mongo_client()

            # Test query: search for a common area to verify DB connection
            test_results = await client.search_areas("National")

            duration_ms = (time.time() - start_time) * 1000

            self.warmup_status[client_name]["status"] = "completed"
            self.warmup_status[client_name]["duration_ms"] = round(duration_ms, 2)
            self.warmup_status[client_name]["completed_at"] = datetime.utcnow().isoformat()

            logger.info(f"[PREWARM] ✓ {client_name} completed in {duration_ms:.0f}ms")
            logger.info(f"[PREWARM] Test search returned {len(test_results)} areas")

            return duration_ms

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = str(e)

            self.warmup_status[client_name]["status"] = "failed"
            self.warmup_status[client_name]["duration_ms"] = round(duration_ms, 2)
            self.warmup_status[client_name]["error"] = error_msg
            self.warmup_status[client_name]["completed_at"] = datetime.utcnow().isoformat()

            logger.error(f"[PREWARM] ✗ {client_name} failed after {duration_ms:.0f}ms: {error_msg}")

            return duration_ms

    async def prewarm_all_clients(self):
        """
        Pre-warm all clients in optimal order.

        Strategy:
        1. SOC Vector Search first (most expensive, ~30s)
        2. Other clients in parallel (~2-5s total)

        Updates overall status and timing.
        """
        logger.info("=" * 80)
        logger.info("[PREWARM] Starting server pre-warming sequence...")
        logger.info("=" * 80)

        self.overall_status = "in_progress"
        self.started_at = datetime.utcnow()
        overall_start = time.time()

        try:
            # Phase 1: SOC Vector Search (most expensive)
            await self.prewarm_soc_vector_search()

            # Phase 2: MongoDB connections sequentially (avoid connection storm to Railway)
            await self.prewarm_mongodb_auth()
            await self.prewarm_mongodb_oews()

            # Phase 3: LLM embeddings (can run after MongoDB)
            await self.prewarm_llm_embeddings()

            # Calculate total duration
            self.total_duration_ms = (time.time() - overall_start) * 1000
            self.completed_at = datetime.utcnow()

            # Check if any failed
            failed_clients = [
                name for name, status in self.warmup_status.items()
                if status["status"] == "failed"
            ]

            if failed_clients:
                self.overall_status = "partial"
                logger.warning(f"[PREWARM] Pre-warming completed with failures: {', '.join(failed_clients)}")
            else:
                self.overall_status = "completed"
                logger.info(f"[PREWARM] ✓ All clients pre-warmed successfully")

            logger.info("=" * 80)
            logger.info(f"[PREWARM] Total pre-warming time: {self.total_duration_ms:.0f}ms ({self.total_duration_ms/1000:.1f}s)")
            logger.info("=" * 80)

        except Exception as e:
            self.overall_status = "failed"
            self.total_duration_ms = (time.time() - overall_start) * 1000
            self.completed_at = datetime.utcnow()

            logger.error(f"[PREWARM] ✗ Pre-warming failed: {str(e)}")
            logger.exception(e)

    def get_warmup_status(self) -> Dict:
        """
        Get current warmup status for health check endpoint.

        Returns:
            Dict with overall status and per-client details
        """
        return {
            "overall_status": self.overall_status,
            "total_duration_ms": self.total_duration_ms,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "clients": self.warmup_status
        }


# Singleton instance
startup_manager = StartupManager()
