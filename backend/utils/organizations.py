"""
Organization CRUD operations with MongoDB (Async).

Provides async operations for creating, reading, and updating organizations.
Uses singleton pattern with async lock for thread safety.
"""

from bson import ObjectId
from datetime import datetime
import asyncio
import re
from auth.database import MongoDB


# Global singleton instance
_organization_crud = None
_lock = asyncio.Lock()


class OrganizationCRUD:
    """Organization CRUD operations with MongoDB (Async Singleton)"""

    def __init__(self):
        """Initialize OrganizationCRUD (lazy initialization for database)"""
        self.db = None
        self.collection = None
        self.users_collection = None

    async def _ensure_initialized(self):
        """Ensure database connection is initialized"""
        if self.db is None:
            self.db = await MongoDB.get_database()
            self.collection = self.db["organizations"]
            self.users_collection = await MongoDB.get_users_collection()

    async def create_organization(self, name: str, owner_id: ObjectId) -> dict:
        """Create a new organization (async)"""
        await self._ensure_initialized()

        slug = await self._generate_slug(name)

        org = {
            "name": name,
            "slug": slug,
            "owner_id": owner_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "status": "active",
            "settings": {
                "default_rates": {
                    "fringe": 0.247,
                    "oh": 0.0711,
                    "ga": 0.2243,
                    "fee": 0.07,
                    "smh": 0.065,
                    "sub_fee": 0.05,
                    "ga_passthrough": 0.025,
                    "ga_adder": 0.0243
                },
                "default_escalation_rate": 0.03,
                "allow_user_rate_override": True
            },
            "subscription": {
                "plan": "free",
                "seats": 5,
                "expires_at": None
            }
        }

        result = await self.collection.insert_one(org)
        org["_id"] = result.inserted_id
        return org

    async def get_by_id(self, org_id: ObjectId) -> dict:
        """Get organization by ObjectId (async)"""
        await self._ensure_initialized()
        return await self.collection.find_one({"_id": org_id})

    async def get_by_slug(self, slug: str) -> dict:
        """Get organization by slug (async)"""
        await self._ensure_initialized()
        return await self.collection.find_one({"slug": slug})

    async def update_settings(self, org_id: ObjectId, settings: dict) -> dict:
        """Update organization settings (async)"""
        await self._ensure_initialized()

        await self.collection.update_one(
            {"_id": org_id},
            {
                "$set": {
                    "settings": settings,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        return await self.get_by_id(org_id)

    async def get_members(self, org_id: ObjectId, role: str = None) -> list:
        """Get all users in organization (async) - queries organizations array"""
        await self._ensure_initialized()

        # Query the organizations array for active members
        query = {
            "organizations": {
                "$elemMatch": {
                    "organization_id": org_id,
                    "status": "active"
                }
            }
        }

        if role:
            query["organizations"]["$elemMatch"]["role"] = role

        cursor = self.users_collection.find(query).sort("firstName", 1)
        members = await cursor.to_list(length=None)

        # Add current org role/status/joinedAt to each member for easy access
        for member in members:
            org_membership = next(
                (org for org in member.get("organizations", [])
                 if org["organization_id"] == org_id),
                None
            )
            if org_membership:
                member["role"] = org_membership["role"]
                member["status"] = org_membership["status"]
                member["joinedAt"] = org_membership.get("joinedAt")

        return members

    async def set_owner(self, org_id: ObjectId, owner_id: ObjectId):
        """Update organization owner (async)"""
        await self._ensure_initialized()

        await self.collection.update_one(
            {"_id": org_id},
            {"$set": {"owner_id": owner_id, "updated_at": datetime.utcnow()}}
        )

    async def _generate_slug(self, name: str) -> str:
        """Generate URL-friendly slug from organization name (async)"""
        await self._ensure_initialized()

        slug = name.lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = slug.strip('-')

        # Check for uniqueness
        counter = 1
        original_slug = slug
        while await self.collection.find_one({"slug": slug}):
            slug = f"{original_slug}-{counter}"
            counter += 1

        return slug


async def get_organization_crud() -> OrganizationCRUD:
    """
    Get or create OrganizationCRUD instance (singleton pattern) - async

    Returns:
        OrganizationCRUD instance
    """
    global _organization_crud
    async with _lock:
        if _organization_crud is None:
            _organization_crud = OrganizationCRUD()
        return _organization_crud
