from typing import Optional, List
from datetime import datetime
from bson import ObjectId
import bcrypt
import asyncio
from .database import MongoDB
from .models import UserSignup, UserResponse, GoogleUserProfile
from .utils import hash_password, verify_password, generate_user_id


# Global singleton instance
_user_crud = None
_lock = asyncio.Lock()


class UserCRUD:
    """Async UserCRUD with Motor driver"""

    def __init__(self):
        """Initialize UserCRUD (lazy initialization for database)"""
        self.db = None
        self.collection = None

    async def _ensure_initialized(self):
        """Ensure database connection is initialized"""
        if self.db is None:
            self.collection = await MongoDB.get_users_collection()
            self.db = await MongoDB.get_database()
    @staticmethod
    async def create_user(user_data: UserSignup) -> UserResponse:
        """Create a new user with default organization (async)"""
        from utils.organizations import get_organization_crud

        users_collection = await MongoDB.get_users_collection()

        # Check if user already exists
        existing_user = await users_collection.find_one({"email": user_data.email})
        if existing_user:
            raise ValueError("User with this email already exists")

        # Create user ID
        user_id = generate_user_id()
        hashed_password = hash_password(user_data.password)
        now = datetime.utcnow()

        # Create organization with slug as name
        org_crud = await get_organization_crud()
        temp_name = f"{user_data.firstName}-{user_data.lastName}-org"
        organization = await org_crud.create_organization(temp_name, user_id)
        org_id = organization["_id"]

        # Update organization name to match slug (unique name)
        db = await MongoDB.get_database()
        await db.organizations.update_one(
            {"_id": org_id},
            {"$set": {"name": organization["slug"]}}
        )

        user_doc = {
            "_id": user_id,
            "firstName": user_data.firstName,
            "lastName": user_data.lastName,
            "email": user_data.email,
            "password": hashed_password,
            "auth_method": "email",
            "current_organization_id": org_id,
            "organizations": [{
                "organization_id": org_id,
                "role": "admin",
                "status": "active",
                "joinedAt": now
            }],
            "createdAt": now,
            "updatedAt": now
        }

        # Insert user into database
        result = await users_collection.insert_one(user_doc)

        if result.inserted_id:
            return UserResponse(
                id=user_id,
                firstName=user_data.firstName,
                lastName=user_data.lastName,
                email=user_data.email,
                createdAt=user_doc["createdAt"]
            )
        else:
            raise Exception("Failed to create user")

    @staticmethod
    async def authenticate_user(email: str, password: str) -> Optional[UserResponse]:
        """Authenticate user with email and password (async)"""
        users_collection = await MongoDB.get_users_collection()

        # Find user by email
        user_doc = await users_collection.find_one({"email": email})
        if not user_doc:
            return None

        # Check if user registered with email/password (not OAuth)
        if user_doc.get("auth_method") != "email":
            return None

        # Verify password
        if not verify_password(password, user_doc["password"]):
            return None

        return UserResponse(
            id=user_doc["_id"],
            firstName=user_doc["firstName"],
            lastName=user_doc["lastName"],
            email=user_doc["email"],
            organization_id=str(user_doc.get("organization_id")) if user_doc.get("organization_id") else None,
            role=user_doc.get("role"),
            status=user_doc.get("status"),
            createdAt=user_doc["createdAt"]
        )

    @staticmethod
    async def get_user_by_email(email: str) -> Optional[UserResponse]:
        """Get user by email (async)"""
        users_collection = await MongoDB.get_users_collection()

        user_doc = await users_collection.find_one({"email": email})
        if not user_doc:
            return None

        return UserResponse(
            id=user_doc["_id"],
            firstName=user_doc["firstName"],
            lastName=user_doc["lastName"],
            email=user_doc["email"],
            organization_id=str(user_doc.get("organization_id")) if user_doc.get("organization_id") else None,
            role=user_doc.get("role"),
            status=user_doc.get("status"),
            createdAt=user_doc["createdAt"]
        )

    @staticmethod
    async def get_user_by_id(user_id: str) -> Optional[UserResponse]:
        """Get user by ID (async)"""
        users_collection = await MongoDB.get_users_collection()

        user_doc = await users_collection.find_one({"_id": user_id})
        if not user_doc:
            return None

        return UserResponse(
            id=user_doc["_id"],
            firstName=user_doc["firstName"],
            lastName=user_doc["lastName"],
            email=user_doc["email"],
            organization_id=str(user_doc.get("organization_id")) if user_doc.get("organization_id") else None,
            role=user_doc.get("role"),
            status=user_doc.get("status"),
            createdAt=user_doc["createdAt"]
        )

    @staticmethod
    async def create_or_update_google_user(google_profile: GoogleUserProfile) -> UserResponse:
        """Create a new Google OAuth user or update existing one (async)"""
        from utils.organizations import get_organization_crud

        users_collection = await MongoDB.get_users_collection()

        # Check if user already exists by email
        existing_user = await users_collection.find_one({"email": google_profile.email})

        if existing_user:
            # Update existing user with Google profile data
            await users_collection.update_one(
                {"_id": existing_user["_id"]},
                {
                    "$set": {
                        "google_id": google_profile.sub,
                        "google_profile": {
                            "name": google_profile.name,
                            "given_name": google_profile.given_name,
                            "family_name": google_profile.family_name,
                            "picture": google_profile.picture,
                            "email_verified": google_profile.email_verified
                        },
                        "auth_method": "google",
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

            return UserResponse(
                id=existing_user["_id"],
                firstName=existing_user.get("firstName", google_profile.given_name),
                lastName=existing_user.get("lastName", google_profile.family_name),
                email=google_profile.email,
                createdAt=existing_user["createdAt"]
            )
        else:
            # Create new Google user with organization
            user_id = generate_user_id()
            now = datetime.utcnow()

            # Create organization with slug as name
            org_crud = await get_organization_crud()
            temp_name = f"{google_profile.given_name}-{google_profile.family_name}-org"
            organization = await org_crud.create_organization(temp_name, user_id)
            org_id = organization["_id"]

            # Update organization name to match slug (unique name)
            db = await MongoDB.get_database()
            await db.organizations.update_one(
                {"_id": org_id},
                {"$set": {"name": organization["slug"]}}
            )

            user_doc = {
                "_id": user_id,
                "firstName": google_profile.given_name,
                "lastName": google_profile.family_name,
                "email": google_profile.email,
                "google_id": google_profile.sub,
                "google_profile": {
                    "name": google_profile.name,
                    "given_name": google_profile.given_name,
                    "family_name": google_profile.family_name,
                    "picture": google_profile.picture,
                    "email_verified": google_profile.email_verified
                },
                "auth_method": "google",
                "current_organization_id": org_id,
                "organizations": [{
                    "organization_id": org_id,
                    "role": "admin",
                    "status": "active",
                    "joinedAt": now
                }],
                "createdAt": now,
                "updatedAt": now
            }

            # Insert user into database
            result = await users_collection.insert_one(user_doc)

            if result.inserted_id:
                return UserResponse(
                    id=user_id,
                    firstName=google_profile.given_name,
                    lastName=google_profile.family_name,
                    email=google_profile.email,
                    createdAt=user_doc["createdAt"]
                )
            else:
                raise Exception("Failed to create Google user")

    async def create_user_with_organization(
        self,
        email: str,
        first_name: str,
        last_name: str,
        password: str,
        organization_id: ObjectId,
        role: str = "user"
    ) -> dict:
        """Create user with organization (for invitation acceptance) - async"""
        await self._ensure_initialized()

        # Check if user already exists
        existing = await self.collection.find_one({"email": email})
        if existing:
            raise ValueError("Email already registered")

        now = datetime.utcnow()
        user = {
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "password": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            "organizations": [{
                "organization_id": organization_id,
                "role": role,
                "status": "active",
                "joinedAt": now
            }],
            "current_organization_id": organization_id,
            "auth_method": "email",
            "createdAt": now,
            "updatedAt": now
        }

        result = await self.collection.insert_one(user)
        user["_id"] = result.inserted_id
        return user

    async def get_by_id(self, user_id: ObjectId) -> Optional[dict]:
        """Get user by ObjectId (async)"""
        await self._ensure_initialized()
        return await self.collection.find_one({"_id": user_id})

    async def get_by_ids(self, user_ids: List[ObjectId]) -> List[dict]:
        """Batch fetch users by IDs (async) - NEW for optimization"""
        await self._ensure_initialized()

        if not user_ids:
            return []

        cursor = self.collection.find(
            {"_id": {"$in": user_ids}},
            {"password": 0}  # Exclude sensitive fields
        )

        return await cursor.to_list(length=None)

    async def remove_from_organization(self, user_id: ObjectId, org_id: ObjectId):
        """Remove user from organization (soft delete in organizations array) - async"""
        await self._ensure_initialized()

        # Update the status to "removed" for this specific organization in the array
        await self.collection.update_one(
            {
                "_id": user_id,
                "organizations.organization_id": org_id
            },
            {
                "$set": {
                    "organizations.$.status": "removed",
                    "updatedAt": datetime.utcnow()
                }
            }
        )


async def get_user_crud() -> UserCRUD:
    """
    Get or create UserCRUD instance (singleton pattern) - async

    Returns:
        UserCRUD instance
    """
    global _user_crud
    async with _lock:
        if _user_crud is None:
            _user_crud = UserCRUD()
        return _user_crud
