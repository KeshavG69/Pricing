"""CRUD operations for Company Repository (GSA Contracts)."""

from typing import List, Optional
from datetime import datetime
from bson import ObjectId
import threading

from auth.database import get_mongodb_client


class CompanyRepositoryCRUD:
    """CRUD operations for company_repositories collection."""

    def __init__(self):
        mongodb = get_mongodb_client()
        self.db = mongodb.get_database()
        self.collection = self.db["company_repositories"]

        # Create indexes
        try:
            self.collection.create_index([("organization_id", 1), ("created_at", -1)])
            self.collection.create_index("file_id", unique=True)
            self.collection.create_index("status")
        except Exception:
            pass

    def create(self, organization_id: str, user_id: str, data: dict) -> dict:
        """Create new company repository entry."""
        import uuid

        doc = {
            "organization_id": organization_id,
            "file_id": str(uuid.uuid4()),
            "created_by": user_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "status": "processing",
            **data
        }

        result = self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    def get_by_file_id(self, file_id: str, organization_id: str) -> Optional[dict]:
        """Get company repository by file_id."""
        return self.collection.find_one({
            "file_id": file_id,
            "organization_id": organization_id
        })

    def get_by_organization(self, organization_id: str) -> List[dict]:
        """Get all company repositories for organization."""
        cursor = self.collection.find(
            {"organization_id": organization_id},
            {"labor_categories": 0}  # Exclude large field for list view
        ).sort("created_at", -1)
        return list(cursor)

    def update(self, file_id: str, organization_id: str, updates: dict) -> Optional[dict]:
        """Update company repository."""
        updates["updated_at"] = datetime.utcnow()

        result = self.collection.find_one_and_update(
            {"file_id": file_id, "organization_id": organization_id},
            {"$set": updates},
            return_document=True
        )
        return result

    def update_status(self, file_id: str, status: str, error_message: str = None) -> bool:
        """Update processing status."""
        updates = {"status": status, "updated_at": datetime.utcnow()}
        if error_message:
            updates["error_message"] = error_message

        result = self.collection.update_one(
            {"file_id": file_id},
            {"$set": updates}
        )
        return result.modified_count > 0

    def delete(self, file_id: str, organization_id: str) -> bool:
        """Delete company repository entry."""
        result = self.collection.delete_one({
            "file_id": file_id,
            "organization_id": organization_id
        })
        return result.deleted_count > 0

    def get_labor_category(self, file_id: str, organization_id: str, lcat_id: str) -> Optional[dict]:
        """Get specific labor category from company repository."""
        doc = self.collection.find_one(
            {"file_id": file_id, "organization_id": organization_id},
            {"labor_categories": 1}
        )

        if not doc or not doc.get("labor_categories"):
            return None

        for lcat in doc["labor_categories"]:
            if lcat.get("lcat_id") == lcat_id:
                return lcat

        return None


# Singleton pattern
_company_repo_crud = None
_lock = threading.RLock()


def get_company_repository_crud() -> CompanyRepositoryCRUD:
    """Get or create CompanyRepositoryCRUD instance."""
    global _company_repo_crud
    with _lock:
        if _company_repo_crud is None:
            _company_repo_crud = CompanyRepositoryCRUD()
        return _company_repo_crud
