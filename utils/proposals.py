"""
CRUD operations for proposal management with MongoDB.

Provides thread-safe operations for creating, reading, updating, and deleting proposals.
"""

from pymongo.collection import Collection
from typing import List, Dict, Optional
from datetime import datetime
from bson import ObjectId


class ProposalCRUD:
    """
    Proposal CRUD operations with MongoDB.

    All methods use user_id (MongoDB ObjectId as string) for ownership verification.
    Thread-safe through PyMongo's built-in connection pooling.
    """

    def __init__(self, collection: Collection):
        """
        Initialize ProposalCRUD with MongoDB collection.

        Args:
            collection: PyMongo collection for proposals
        """
        self.collection = collection

        # Create indexes for performance
        self.collection.create_index([("user_id", 1), ("created_at", -1)])
        self.collection.create_index("status")

    def create_proposal(self, user_id: str, data: dict) -> dict:
        """
        Create a new proposal.

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
            **data
        }
        result = self.collection.insert_one(proposal)
        proposal["_id"] = result.inserted_id
        return proposal

    def get_user_proposals(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20
    ) -> List[dict]:
        """
        Get paginated list of user's proposals (summary view).

        Args:
            user_id: User's MongoDB ObjectId (as string)
            skip: Number of records to skip (for pagination)
            limit: Maximum number of records to return

        Returns:
            List of proposal documents sorted by created_at (newest first)
        """
        cursor = self.collection.find(
            {"user_id": user_id}
        ).sort("created_at", -1).skip(skip).limit(limit)
        return list(cursor)

    def get_proposal(self, proposal_id: str, user_id: str) -> Optional[dict]:
        """
        Get single proposal if user owns it.

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)

        Returns:
            Proposal document or None if not found/unauthorized
        """
        return self.collection.find_one({
            "_id": ObjectId(proposal_id),
            "user_id": user_id
        })

    def update_proposal(
        self,
        proposal_id: str,
        user_id: str,
        updates: dict
    ) -> Optional[dict]:
        """
        Update proposal and return updated document.

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
            return_document=True
        )
        return result

    def delete_proposal(self, proposal_id: str, user_id: str) -> bool:
        """
        Delete proposal if user owns it.

        Args:
            proposal_id: Proposal's MongoDB ObjectId (as string)
            user_id: User's MongoDB ObjectId (as string)

        Returns:
            True if deleted, False if not found/unauthorized
        """
        result = self.collection.delete_one({
            "_id": ObjectId(proposal_id),
            "user_id": user_id
        })
        return result.deleted_count > 0

    def duplicate_proposal(
        self,
        proposal_id: str,
        user_id: str,
        new_name: str
    ) -> Optional[dict]:
        """
        Duplicate an existing proposal (copies data, not documents).

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

        return self.create_proposal(user_id, new_proposal)
