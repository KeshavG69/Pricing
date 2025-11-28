"""
CRUD operations for proposal management with MongoDB.

Provides thread-safe operations for creating, reading, updating, and deleting proposals.
Uses singleton pattern with RLock for thread safety.
"""

from pymongo.collection import Collection
from typing import List, Dict, Optional
from datetime import datetime
from bson import ObjectId
from functools import lru_cache
import json
import threading
import time


class ProposalCRUD:
    """
    Proposal CRUD operations with MongoDB (Thread-safe Singleton).

    All methods use user_id (MongoDB ObjectId as string) for ownership verification.
    Thread-safe through:
    - Singleton pattern ensures one instance across all threads
    - RLock for thread-safe operations
    - PyMongo's built-in connection pooling
    """

    _instance = None
    _lock = threading.RLock()
    _initialized = False

    def __new__(cls, collection: Collection = None):
        """Singleton pattern with thread-safe instantiation."""
        if cls._instance is None:
            with cls._lock:
                # Double-check locking pattern
                if cls._instance is None:
                    cls._instance = super(ProposalCRUD, cls).__new__(cls)
        return cls._instance

    def __init__(self, collection: Collection = None):
        """
        Initialize ProposalCRUD with MongoDB collection (singleton).

        Only initializes once, subsequent calls are ignored.

        Args:
            collection: PyMongo collection for proposals
        """
        # Prevent re-initialization
        if self._initialized:
            return

        with self._lock:
            if self._initialized:
                return

            if collection is None:
                raise ValueError("Collection must be provided on first initialization")

            self.collection = collection
            self.operation_lock = threading.RLock()

            # Create indexes for performance (idempotent - safe to call multiple times)
            try:
                self.collection.create_index([("user_id", 1), ("created_at", -1)])
                self.collection.create_index("status")

                # Compound index for efficient filtered dashboard queries
                self.collection.create_index([
                    ("user_id", 1),
                    ("status", 1),
                    ("created_at", -1)
                ])

                # Note: (_id, user_id) index may already exist from previous setup
                # MongoDB's _id is already indexed, so this is optional
            except Exception:
                # Silently ignore index creation errors (indexes may already exist)
                pass

            self.__class__._initialized = True

    def create_proposal(self, user_id: str, data: dict) -> dict:
        """
        Create a new proposal (thread-safe).

        Clears list cache to include new proposal.

        Args:
            user_id: User's MongoDB ObjectId (as string)
            data: Proposal data (name, solicitation_number, documents, etc.)

        Returns:
            Created proposal document with _id
        """
        with self.operation_lock:
            proposal = {
                "user_id": user_id,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "status": "processing",  # processing, completed, error
                **data
            }
            result = self.collection.insert_one(proposal)
            proposal["_id"] = result.inserted_id

            # Invalidate list cache to show new proposal
            self.get_user_proposals.cache_clear()

            return proposal

    @lru_cache(maxsize=128)
    def get_user_proposals(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20,
        sort_by: str = "date",
        sort_order: str = "desc"
    ) -> List[dict]:
        """
        Get paginated list of user's proposals (summary view, thread-safe, cached).

        Cache stores up to 128 recent list queries for faster dashboard loading.

        Args:
            user_id: User's MongoDB ObjectId (as string)
            skip: Number of records to skip (for pagination)
            limit: Maximum number of records to return
            sort_by: Field to sort by ("date", "name", "status")
            sort_order: Sort order ("asc", "desc")

        Returns:
            List of proposal documents sorted by specified field and order
        """
        with self.operation_lock:
            # Map sort field names to MongoDB field names
            sort_field_map = {
                "date": "created_at",
                "name": "name",
                "status": "status"
            }

            # Get MongoDB field name, default to created_at if invalid
            sort_field = sort_field_map.get(sort_by, "created_at")

            # Convert sort order to MongoDB sort direction
            sort_direction = -1 if sort_order == "desc" else 1

            # Exclude large fields only (don't mix with inclusions)
            # MongoDB doesn't allow mixing inclusion and exclusion projections
            projection = {
                "spreadsheet_data": 0,
                "jobs": 0,
                "rates": 0,
                "escalation_rates": 0,
                "documents": 0
            }

            cursor = self.collection.find(
                {"user_id": user_id},
                projection
            ).sort(sort_field, sort_direction).skip(skip).limit(limit)
            return list(cursor)

    @lru_cache(maxsize=512)
    def get_proposal(self, proposal_id: str, user_id: str) -> Optional[dict]:
        """
        Get single proposal if user owns it (thread-safe, cached).

        Cache stores up to 512 recent proposals for faster access.
        Cache is invalidated when proposal is updated.

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)

        Returns:
            Proposal document or None if not found/unauthorized
        """
        with self.operation_lock:
            return self.collection.find_one({
                "_id": ObjectId(proposal_id),
                "user_id": user_id
            })

    def _make_proposal_cache_key(self, proposal_id: str, user_id: str) -> str:
        """Create a hashable cache key for proposal lookups."""
        return f"{proposal_id}:{user_id}"

    @lru_cache(maxsize=256)
    def get_proposal_summary(self, proposal_id: str, user_id: str) -> Optional[dict]:
        """
        Get proposal summary (lightweight, cached).

        Cache stores up to 256 recent summaries.
        Use this for dashboard previews or quick lookups.
        Excludes large fields like jobs, spreadsheet_data.

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)

        Returns:
            Lightweight proposal summary or None if not found
        """
        projection = {
            "jobs": 0,
            "spreadsheet_data": 0,
            "rates": 0,
            "escalation_rates": 0,
            "documents": 0
        }

        return self.collection.find_one(
            {"_id": ObjectId(proposal_id), "user_id": user_id},
            projection
        )

    def update_proposal(
        self,
        proposal_id: str,
        user_id: str,
        updates: dict
    ) -> Optional[dict]:
        """
        Update proposal and return updated document (thread-safe).

        Clears cache for this proposal to ensure fresh data.

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)
            updates: Fields to update

        Returns:
            Updated proposal document or None if not found/unauthorized
        """
        with self.operation_lock:
            updates["updated_at"] = datetime.utcnow()
            result = self.collection.find_one_and_update(
                {"_id": ObjectId(proposal_id), "user_id": user_id},
                {"$set": updates},
                return_document=True
            )

            # Invalidate caches for this proposal
            if result:
                self.get_proposal.cache_clear()  # Clear entire cache (simple approach)
                self.get_proposal_summary.cache_clear()
                self.get_user_proposals.cache_clear()

            return result

    def delete_proposal(self, proposal_id: str, user_id: str) -> bool:
        """
        Delete proposal if user owns it (thread-safe).

        Clears cache after deletion.

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)

        Returns:
            True if deleted, False if not found/unauthorized
        """
        with self.operation_lock:
            result = self.collection.delete_one({
                "_id": ObjectId(proposal_id),
                "user_id": user_id
            })

            # Invalidate caches
            if result.deleted_count > 0:
                self.get_proposal.cache_clear()
                self.get_proposal_summary.cache_clear()
                self.get_user_proposals.cache_clear()

            return result.deleted_count > 0

    def duplicate_proposal(
        self,
        proposal_id: str,
        user_id: str,
        new_name: str
    ) -> Optional[dict]:
        """
        Duplicate an existing proposal (copies data, not documents, thread-safe).

        Clears list cache to include new proposal.

        Args:
            proposal_id: Source proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)
            new_name: Name for the duplicated proposal

        Returns:
            New proposal document or None if source not found/unauthorized
        """
        with self.operation_lock:
            # Get source proposal
            source = self.get_proposal(proposal_id, user_id)
            if not source:
                return None

            # Create new proposal with copied data
            new_proposal = {
                "name": new_name,
                "solicitation_number": source.get("solicitation_number"),
                "metadata": source.get("metadata"),
                "jobs": source.get("jobs"),
                "rates": source.get("rates"),
                "escalation_rates": source.get("escalation_rates"),
                "spreadsheet_data": source.get("spreadsheet_data"),
                "total_cost": source.get("total_cost"),
                "documents": []  # Don't copy documents
            }

            # create_proposal already clears cache, but be explicit
            result = self.create_proposal(user_id, new_proposal)
            return result


# Module-level singleton instance
_proposal_crud_instance = None
_instance_lock = threading.RLock()


def get_proposal_crud(collection: Collection = None) -> ProposalCRUD:
    """
    Get singleton ProposalCRUD instance (thread-safe).

    Args:
        collection: MongoDB collection (required on first call only)

    Returns:
        Singleton ProposalCRUD instance

    Usage:
        from utils.proposals import get_proposal_crud
        crud = get_proposal_crud(collection)
    """
    global _proposal_crud_instance

    if _proposal_crud_instance is None:
        with _instance_lock:
            if _proposal_crud_instance is None:
                _proposal_crud_instance = ProposalCRUD(collection)

    return _proposal_crud_instance
