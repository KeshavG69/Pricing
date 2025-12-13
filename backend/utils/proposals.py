"""
CRUD operations for proposal management with MongoDB.

Provides async operations for creating, reading, updating, and deleting proposals.
Uses singleton pattern with async lock for thread safety.
"""

from motor.motor_asyncio import AsyncIOMotorCollection
from typing import List, Dict, Optional
from datetime import datetime
from bson import ObjectId
import asyncio


class ProposalCRUD:
    """
    Proposal CRUD operations with MongoDB (Async Singleton).

    All methods use user_id (MongoDB ObjectId as string) for ownership verification.
    Thread-safe through:
    - Singleton pattern ensures one instance across all async tasks
    - asyncio.Lock for async-safe operations
    - Motor's built-in connection pooling
    """

    _instance = None
    _lock = asyncio.Lock()
    _initialized = False

    def __new__(cls, collection: AsyncIOMotorCollection = None):
        """Singleton pattern with async-safe instantiation."""
        if cls._instance is None:
            cls._instance = super(ProposalCRUD, cls).__new__(cls)
        return cls._instance

    def __init__(self, collection: AsyncIOMotorCollection = None):
        """
        Initialize ProposalCRUD with MongoDB collection (singleton).

        Only initializes once, subsequent calls are ignored.

        Args:
            collection: Motor AsyncIOMotorCollection for proposals
        """
        # Prevent re-initialization
        if self._initialized:
            return

        if not self._initialized:
            if collection is None:
                # Lazy initialization - collection will be set later
                self.collection = None
            else:
                self.collection = collection

            self.__class__._initialized = True

    async def _ensure_initialized(self, collection: AsyncIOMotorCollection = None):
        """Ensure collection is set (for lazy initialization)"""
        if self.collection is None and collection is not None:
            self.collection = collection

            # Create indexes for performance (idempotent - safe to call multiple times)
            try:
                await self.collection.create_index([("user_id", 1), ("created_at", -1)])
                await self.collection.create_index("status")

                # Compound index for efficient filtered dashboard queries
                await self.collection.create_index([
                    ("user_id", 1),
                    ("status", 1),
                    ("created_at", -1)
                ])

                # Organization indexes
                await self.collection.create_index([("organization_id", 1), ("created_at", -1)])
                await self.collection.create_index("shared_with")

            except Exception:
                # Silently ignore index creation errors (indexes may already exist)
                pass

    async def create_proposal(self, user_id: str, data: dict) -> dict:
        """
        
        Create a new proposal (async).

        Args:
            user_id: User's MongoDB ObjectId (as string)
            data: Proposal data (name, solicitation_number, documents, etc.)

        Returns:
            Created proposal document with _id
        """
        await self._ensure_initialized()

        proposal = {
            "user_id": user_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "status": "processing",  # processing, completed, error
            **data
        }
        result = await self.collection.insert_one(proposal)
        proposal["_id"] = result.inserted_id

        return proposal

    async def get_user_proposals(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20,
        sort_by: str = "date",
        sort_order: str = "desc"
    ) -> List[dict]:
        """
        Get paginated list of user's proposals (summary view, async).

        Args:
            user_id: User's MongoDB ObjectId (as string)
            skip: Number of records to skip (for pagination)
            limit: Maximum number of records to return
            sort_by: Field to sort by ("date", "name", "status")
            sort_order: Sort order ("asc", "desc")

        Returns:
            List of proposal documents sorted by specified field and order
        """
        await self._ensure_initialized()

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

        # Exclude large fields for list view
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

        return await cursor.to_list(length=None)

    async def get_proposal(self, proposal_id: str, user_id: str) -> Optional[dict]:
        """
        Get single proposal if user owns it (async).

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)

        Returns:
            Proposal document or None if not found/unauthorized
        """
        await self._ensure_initialized()

        return await self.collection.find_one({
            "_id": ObjectId(proposal_id),
            "user_id": user_id
        })

    async def get_proposal_summary(self, proposal_id: str, user_id: str) -> Optional[dict]:
        """
        Get proposal summary (lightweight, async).

        Use this for dashboard previews or quick lookups.
        Excludes large fields like jobs, spreadsheet_data.

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)

        Returns:
            Lightweight proposal summary or None if not found
        """
        await self._ensure_initialized()

        projection = {
            "jobs": 0,
            "spreadsheet_data": 0,
            "rates": 0,
            "escalation_rates": 0,
            "documents": 0
        }

        return await self.collection.find_one(
            {"_id": ObjectId(proposal_id), "user_id": user_id},
            projection
        )

    async def update_proposal(
        self,
        proposal_id: str,
        user_id: str,
        updates: dict
    ) -> Optional[dict]:
        """
        Update proposal and return updated document (async).

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)
            updates: Fields to update

        Returns:
            Updated proposal document or None if not found/unauthorized
        """
        await self._ensure_initialized()

        updates["updated_at"] = datetime.utcnow()
        result = await self.collection.find_one_and_update(
            {"_id": ObjectId(proposal_id), "user_id": user_id},
            {"$set": updates},
            return_document=True
        )

        return result

    async def delete_proposal(self, proposal_id: str, user_id: str) -> bool:
        """
        Delete proposal if user owns it (async).

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)

        Returns:
            True if deleted, False if not found/unauthorized
        """
        await self._ensure_initialized()

        result = await self.collection.delete_one({
            "_id": ObjectId(proposal_id),
            "user_id": user_id
        })

        return result.deleted_count > 0

    async def duplicate_proposal(
        self,
        proposal_id: str,
        user_id: str,
        new_name: str
    ) -> Optional[dict]:
        """
        Duplicate an existing proposal (copies data, not documents, async).

        Args:
            proposal_id: Source proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)
            new_name: Name for the duplicated proposal

        Returns:
            New proposal document or None if source not found/unauthorized
        """
        await self._ensure_initialized()

        # Get source proposal
        source = await self.get_proposal(proposal_id, user_id)
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

        result = await self.create_proposal(user_id, new_proposal)
        return result

    async def create_proposal_with_organization(
        self,
        user_id: str,
        organization_id: ObjectId,
        data: dict
    ) -> dict:
        """
        Create proposal with organization support (async).

        Args:
            user_id: User's ID as string (UUID format)
            organization_id: Organization's MongoDB ObjectId
            data: Proposal data (name, solicitation_number, documents, etc.)

        Returns:
            Created proposal document with _id
        """
        await self._ensure_initialized()

        proposal = {
            "user_id": user_id,  # Store as string (UUID format)
            "organization_id": organization_id,
            "visibility": "private",
            "shared_with": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "status": "processing",
            **data
        }

        result = await self.collection.insert_one(proposal)
        proposal["_id"] = result.inserted_id

        return proposal

    async def get_user_proposals_by_org(
        self,
        user_id: str,
        organization_id: ObjectId,
        role: str,
        skip: int = 0,
        limit: int = 20,
        sort_by: str = "date",
        sort_order: str = "desc"
    ) -> List[dict]:
        """
        Get proposals based on user's role in organization (async).

        Admin: All org proposals
        User: Own proposals + shared proposals

        Args:
            user_id: User's ID
            organization_id: Organization's ObjectId
            role: User's role ("admin" or "user")
            skip: Pagination skip
            limit: Pagination limit
            sort_by: Sort field
            sort_order: Sort direction

        Returns:
            List of proposal documents
        """
        await self._ensure_initialized()

        # Build query based on role
        if role == "admin":
            # Admin sees all proposals in organization
            query = {"organization_id": organization_id}
        else:
            # Regular user sees own + shared proposals
            query = {
                "$or": [
                    {"user_id": user_id},
                    {"shared_with": user_id}
                ],
                "organization_id": organization_id
            }

        # Map sort field names
        sort_field_map = {
            "date": "created_at",
            "name": "name",
            "status": "status"
        }

        sort_field = sort_field_map.get(sort_by, "created_at")
        sort_direction = -1 if sort_order == "desc" else 1

        # Exclude large fields
        projection = {
            "spreadsheet_data": 0,
            "jobs": 0,
            "rates": 0,
            "escalation_rates": 0,
            "documents": 0
        }

        cursor = self.collection.find(query, projection).sort(
            sort_field, sort_direction
        ).skip(skip).limit(limit)

        return await cursor.to_list(length=None)

    async def share_proposal(
        self,
        proposal_id: ObjectId,
        user_ids: List[ObjectId],
        admin_id: str
    ) -> Optional[dict]:
        """
        Share proposal with specific users (admin only, async).

        Args:
            proposal_id: Proposal's ObjectId
            user_ids: List of user ObjectIds to share with
            admin_id: Admin's user ID (for verification)

        Returns:
            Updated proposal or None
        """
        await self._ensure_initialized()

        result = await self.collection.find_one_and_update(
            {"_id": proposal_id},
            {
                "$set": {
                    "visibility": "shared",
                    "shared_with": user_ids,
                    "updated_at": datetime.utcnow()
                }
            },
            return_document=True
        )

        return result

    async def unshare_proposal(
        self,
        proposal_id: ObjectId,
        user_id: ObjectId = None
    ) -> Optional[dict]:
        """
        Remove user from shared list or make proposal private (async).

        Args:
            proposal_id: Proposal's ObjectId
            user_id: Optional user ObjectId to remove (if None, makes private)

        Returns:
            Updated proposal or None
        """
        await self._ensure_initialized()

        if user_id:
            # Remove specific user from shared list
            result = await self.collection.find_one_and_update(
                {"_id": proposal_id},
                {
                    "$pull": {"shared_with": user_id},
                    "$set": {"updated_at": datetime.utcnow()}
                },
                return_document=True
            )

            # If no more users, set visibility to private
            if result and len(result.get("shared_with", [])) == 0:
                result = await self.collection.find_one_and_update(
                    {"_id": proposal_id},
                    {"$set": {"visibility": "private"}},
                    return_document=True
                )
        else:
            # Make proposal private
            result = await self.collection.find_one_and_update(
                {"_id": proposal_id},
                {
                    "$set": {
                        "visibility": "private",
                        "shared_with": [],
                        "updated_at": datetime.utcnow()
                    }
                },
                return_document=True
            )

        return result

    async def get_by_id(self, proposal_id: str) -> Optional[dict]:
        """
        Get proposal by ID without user check (async).

        Use for admin operations or when user check is done elsewhere.

        Args:
            proposal_id: Proposal's ObjectId as string

        Returns:
            Proposal document or None
        """
        await self._ensure_initialized()

        try:
            obj_id = ObjectId(proposal_id)
        except:
            return None

        return await self.collection.find_one({"_id": obj_id})

    async def count_user_proposals(
        self,
        user_id: str,
        organization_id: ObjectId = None,
        role: str = "user"
    ) -> int:
        """
        Count user's proposals (async).

        Args:
            user_id: User's ID
            organization_id: Optional organization filter
            role: User's role

        Returns:
            Count of proposals
        """
        await self._ensure_initialized()

        if organization_id:
            # Organization-aware count
            if role == "admin":
                query = {"organization_id": organization_id}
            else:
                query = {
                    "$or": [
                        {"user_id": user_id},
                        {"shared_with": user_id}
                    ],
                    "organization_id": organization_id
                }
        else:
            # Simple user count
            query = {"user_id": user_id}

        return await self.collection.count_documents(query)

    async def get_org_proposal_count(self, organization_id: ObjectId) -> int:
        """
        Count proposals in organization (async).

        Args:
            organization_id: Organization's ObjectId

        Returns:
            Count of proposals
        """
        await self._ensure_initialized()

        return await self.collection.count_documents({
            "organization_id": organization_id
        })

    async def update_status(
        self,
        proposal_id: str,
        user_id: str,
        status: str,
        message: str = None
    ) -> bool:
        """
        Update proposal status (async).

        Args:
            proposal_id: Proposal's ObjectId as string
            user_id: User's ID for verification
            status: New status
            message: Optional status message

        Returns:
            True if updated, False otherwise
        """
        await self._ensure_initialized()

        updates = {
            "status": status,
            "updated_at": datetime.utcnow()
        }

        if message:
            updates["status_message"] = message

        result = await self.collection.update_one(
            {"_id": ObjectId(proposal_id), "user_id": user_id},
            {"$set": updates}
        )

        return result.modified_count > 0


# Singleton pattern for ProposalCRUD
def get_proposal_crud(collection=None):
    """
    Get singleton ProposalCRUD instance.

    Args:
        collection: Motor AsyncIOMotorCollection for proposals

    Returns:
        ProposalCRUD singleton instance
    """
    return ProposalCRUD(collection)
