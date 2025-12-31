"""
CRUD operations for proposal management with MongoDB.

Provides sync operations for creating, reading, updating, and deleting proposals.
Uses singleton pattern with thread safety.
"""

from typing import List, Dict, Optional
from datetime import datetime
from bson import ObjectId
from pymongo import ReturnDocument
import threading
from auth.database import get_mongodb_client


class ProposalCRUD:
    """
    Proposal CRUD operations with MongoDB (Sync Singleton).

    All methods use user_id (MongoDB ObjectId as string) for ownership verification.
    Thread-safe through singleton pattern with threading.RLock().
    """

    def __init__(self):
        """Initialize ProposalCRUD with MongoDB collection"""
        mongodb = get_mongodb_client()
        self.db = mongodb.get_database()
        self.collection = self.db["proposals"]

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

            # Organization indexes
            self.collection.create_index([("organization_id", 1), ("created_at", -1)])
            self.collection.create_index("shared_with")

            # Business status indexes
            self.collection.create_index("business_status")
            self.collection.create_index([
                ("organization_id", 1),
                ("business_status", 1),
                ("created_at", -1)
            ])

        except Exception:
            # Silently ignore index creation errors (indexes may already exist)
            pass

    def create_proposal(self, user_id: str, data: dict) -> dict:
        """
        
        Create a new proposal (sync).

        Args:
            user_id: User's MongoDB ObjectId (as string)
            data: Proposal data (name, solicitation_number, documents, etc.)

        Returns:
            Created proposal document with _id
        """
        

        proposal = {
            "user_id": user_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "status": "processing",  # processing, completed, error
            "excel_downloaded": False,  # Track if user has downloaded the Excel file
            **data
        }
        result = self.collection.insert_one(proposal)
        proposal["_id"] = result.inserted_id

        return proposal

    def get_user_proposals(
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

        return list(cursor)

    def get_proposal(
        self,
        proposal_id: str,
        user_id: str,
        organization_id: Optional[str] = None,
        role: Optional[str] = None
    ) -> Optional[dict]:
        """
        Get single proposal if user has access to it (sync).

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)
            organization_id: User's organization ID (optional)
            role: User's role (optional, 'admin' gets full org access)

        Returns:
            Proposal document or None if not found/unauthorized
        """

        # Build query based on access level
        if organization_id:
            if role == "admin":
                # Admin can access any proposal in their org
                query = {
                    "_id": ObjectId(proposal_id),
                    "organization_id": organization_id
                }
            else:
                # Regular user: owned by them OR shared with them
                query = {
                    "_id": ObjectId(proposal_id),
                    "$or": [
                        {"user_id": user_id},
                        {"shared_with": user_id}
                    ],
                    "organization_id": organization_id
                }
        else:
            # No organization - simple ownership check
            query = {
                "_id": ObjectId(proposal_id),
                "user_id": user_id
            }

        return self.collection.find_one(query)

    def get_proposal_summary(self, proposal_id: str, user_id: str) -> Optional[dict]:
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

    def can_change_business_status(self, proposal_id: str) -> tuple[bool, str]:
        """
        Check if a proposal's business status can be changed.

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)

        Returns:
            Tuple of (can_change: bool, reason: str)
        """
        try:
            proposal = self.collection.find_one(
                {"_id": ObjectId(proposal_id)},
                {"status": 1}
            )

            if not proposal:
                return False, "Proposal not found"

            status = proposal.get("status")
            if status == "processing":
                return False, "Cannot change status while processing"
            if status == "error":
                return False, "Proposal has errors"

            return True, ""
        except Exception:
            return False, "Invalid proposal ID"

    def update_proposal(
        self,
        proposal_id: str,
        user_id: str,
        updates: dict
    ) -> Optional[dict]:
        """
        Update proposal and return updated document (sync).

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)
            updates: Fields to update

        Returns:
            Updated proposal document or None if not found/unauthorized
        """
        

        updates["updated_at"] = datetime.utcnow()
        result = self.collection.find_one_and_update(
            {"_id": ObjectId(proposal_id), "user_id": user_id},
            {"$set": updates},
            return_document=ReturnDocument.AFTER
        )

        return result

    def delete_proposal(
        self,
        proposal_id: str,
        user_id: str,
        organization_id: Optional[str] = None,
        role: Optional[str] = None
    ) -> bool:
        """
        Delete proposal if user has access to it (sync).

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)
            organization_id: User's organization ID (optional)
            role: User's role (optional, 'admin' can delete any org proposal)

        Returns:
            True if deleted, False if not found/unauthorized
        """

        # Build query based on access level
        if organization_id:
            if role == "admin":
                # Admin can delete any proposal in their org
                query = {
                    "_id": ObjectId(proposal_id),
                    "organization_id": organization_id
                }
            else:
                # Regular user: can only delete proposals they own
                # Note: shared_with users cannot delete proposals
                query = {
                    "_id": ObjectId(proposal_id),
                    "user_id": user_id,
                    "organization_id": organization_id
                }
        else:
            # No organization - simple ownership check
            query = {
                "_id": ObjectId(proposal_id),
                "user_id": user_id
            }

        result = self.collection.delete_one(query)

        return result.deleted_count > 0

    def duplicate_proposal(
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

        result = self.create_proposal(user_id, new_proposal)
        return result

    def create_proposal_with_organization(
        self,
        user_id: str,
        organization_id: ObjectId,
        data: dict
    ) -> dict:
        """
        Create proposal with organization support (sync).

        Args:
            user_id: User's ID as string (UUID format)
            organization_id: Organization's MongoDB ObjectId
            data: Proposal data (name, solicitation_number, documents, etc.)

        Returns:
            Created proposal document with _id
        """
        

        proposal = {
            "user_id": user_id,  # Store as string (UUID format)
            "organization_id": organization_id,
            "visibility": "private",
            "shared_with": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "status": "processing",
            "excel_downloaded": False,  # Track if user has downloaded the Excel file
            **data
        }

        result = self.collection.insert_one(proposal)
        proposal["_id"] = result.inserted_id

        return proposal

    def get_user_proposals_by_org(
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
        Get proposals based on user's role in organization (sync).

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

        return list(cursor)

    def share_proposal(
        self,
        proposal_id: ObjectId,
        user_ids: List[str],
        admin_id: str
    ) -> Optional[dict]:
        """
        Share proposal with specific users (admin only, async).

        Args:
            proposal_id: Proposal's ObjectId
            user_ids: List of user IDs (strings) to share with
            admin_id: Admin's user ID (for verification)

        Returns:
            Updated proposal or None
        """
        

        result = self.collection.find_one_and_update(
            {"_id": proposal_id},
            {
                "$set": {
                    "visibility": "shared",
                    "shared_with": user_ids,
                    "updated_at": datetime.utcnow()
                }
            },
            return_document=ReturnDocument.AFTER
        )

        return result

    def unshare_proposal(
        self,
        proposal_id: ObjectId,
        user_id: ObjectId = None
    ) -> Optional[dict]:
        """
        Remove user from shared list or make proposal private (sync).

        Args:
            proposal_id: Proposal's ObjectId
            user_id: Optional user ObjectId to remove (if None, makes private)

        Returns:
            Updated proposal or None
        """
        

        if user_id:
            # Remove specific user from shared list
            result = self.collection.find_one_and_update(
                {"_id": proposal_id},
                {
                    "$pull": {"shared_with": user_id},
                    "$set": {"updated_at": datetime.utcnow()}
                },
                return_document=ReturnDocument.AFTER
            )

            # If no more users, set visibility to private
            if result and len(result.get("shared_with", [])) == 0:
                result = self.collection.find_one_and_update(
                    {"_id": proposal_id},
                    {"$set": {"visibility": "private"}},
                    return_document=ReturnDocument.AFTER
                )
        else:
            # Make proposal private
            result = self.collection.find_one_and_update(
                {"_id": proposal_id},
                {
                    "$set": {
                        "visibility": "private",
                        "shared_with": [],
                        "updated_at": datetime.utcnow()
                    }
                },
                return_document=ReturnDocument.AFTER
            )

        return result

    def get_by_id(self, proposal_id: str) -> Optional[dict]:
        """
        Get proposal by ID without user check (sync).

        Use for admin operations or when user check is done elsewhere.

        Args:
            proposal_id: Proposal's ObjectId as string

        Returns:
            Proposal document or None
        """
        

        try:
            obj_id = ObjectId(proposal_id)
        except:
            return None

        return self.collection.find_one({"_id": obj_id})

    def count_user_proposals(
        self,
        user_id: str,
        organization_id: ObjectId = None,
        role: str = "user"
    ) -> int:
        """
        Count user's proposals (sync).

        Args:
            user_id: User's ID
            organization_id: Optional organization filter
            role: User's role

        Returns:
            Count of proposals
        """
        

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

        return self.collection.count_documents(query)

    def get_org_proposal_count(self, organization_id: ObjectId) -> int:
        """
        Count proposals in organization (sync).

        Args:
            organization_id: Organization's ObjectId

        Returns:
            Count of proposals
        """
        

        return self.collection.count_documents({
            "organization_id": organization_id
        })

    def update_status(
        self,
        proposal_id: str,
        user_id: str,
        status: str,
        message: str = None
    ) -> bool:
        """
        Update proposal status (sync).

        Args:
            proposal_id: Proposal's ObjectId as string
            user_id: User's ID for verification
            status: New status
            message: Optional status message

        Returns:
            True if updated, False otherwise
        """
        

        updates = {
            "status": status,
            "updated_at": datetime.utcnow()
        }

        if message:
            updates["status_message"] = message

        result = self.collection.update_one(
            {"_id": ObjectId(proposal_id), "user_id": user_id},
            {"$set": updates}
        )

        return result.modified_count > 0

    def check_for_timeout(self, proposal: dict) -> dict:
        """
        Check if proposal is stuck in processing for >30 min and mark as error.
        """
        if proposal.get("status") != "processing":
            return proposal

        created_at = proposal.get("created_at")
        if not created_at:
            return proposal

        # 30 minute timeout
        elapsed = (datetime.utcnow() - created_at).total_seconds()
        if elapsed < 30 * 60:
            return proposal  # Still within timeout

        # Timed out - mark as error
        self.collection.update_one(
            {"_id": proposal["_id"]},
            {"$set": {
                "status": "error",
                "message": "Processing timed out. Click 'Retry Processing' to try again.",
                "updated_at": datetime.utcnow()
            }}
        )
        proposal["status"] = "error"
        proposal["message"] = "Processing timed out. Click 'Retry Processing' to try again."
        return proposal


# Global singleton instance
_proposal_crud = None
_lock = threading.RLock()


def get_proposal_crud() -> ProposalCRUD:
    """
    Get or create ProposalCRUD instance (singleton pattern)

    Returns:
        ProposalCRUD instance
    """
    global _proposal_crud
    with _lock:
        if _proposal_crud is None:
            _proposal_crud = ProposalCRUD()
        return _proposal_crud
