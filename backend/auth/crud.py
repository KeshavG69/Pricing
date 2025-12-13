from typing import Optional
from datetime import datetime
from bson import ObjectId
import bcrypt
import threading
from .database import MongoDB
from .models import UserSignup, UserResponse, GoogleUserProfile
from .utils import hash_password, verify_password, generate_user_id


# Global singleton instance
_user_crud = None
_lock = threading.RLock()


class UserCRUD:
    def __init__(self):
        """Initialize UserCRUD with database collections"""
        self.db = MongoDB.get_database()
        self.collection = self.db["users"]
    @staticmethod
    def create_user(user_data: UserSignup) -> UserResponse:
        """Create a new user in the database"""
        users_collection = MongoDB.get_users_collection()

        # Check if user already exists
        existing_user = users_collection.find_one({"email": user_data.email})
        if existing_user:
            raise ValueError("User with this email already exists")

        # Create user document
        user_id = generate_user_id()
        hashed_password = hash_password(user_data.password)

        user_doc = {
            "_id": user_id,
            "firstName": user_data.firstName,
            "lastName": user_data.lastName,
            "email": user_data.email,
            "password": hashed_password,
            "auth_method": "email",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }

        # Insert user into database
        result = users_collection.insert_one(user_doc)

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
    def authenticate_user(email: str, password: str) -> Optional[UserResponse]:
        """Authenticate user with email and password"""
        users_collection = MongoDB.get_users_collection()

        # Find user by email
        user_doc = users_collection.find_one({"email": email})
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
    def get_user_by_email(email: str) -> Optional[UserResponse]:
        """Get user by email"""
        users_collection = MongoDB.get_users_collection()

        user_doc = users_collection.find_one({"email": email})
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
    def get_user_by_id(user_id: str) -> Optional[UserResponse]:
        """Get user by ID"""
        users_collection = MongoDB.get_users_collection()

        user_doc = users_collection.find_one({"_id": user_id})
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
    def create_or_update_google_user(google_profile: GoogleUserProfile) -> UserResponse:
        """Create a new Google OAuth user or update existing one"""
        users_collection = MongoDB.get_users_collection()

        # Check if user already exists by email
        existing_user = users_collection.find_one({"email": google_profile.email})

        if existing_user:
            # Update existing user with Google profile data
            users_collection.update_one(
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
            # Create new Google user
            user_id = generate_user_id()
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
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Insert user into database
            result = users_collection.insert_one(user_doc)

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

    def create_user_with_organization(
        self,
        email: str,
        first_name: str,
        last_name: str,
        password: str,
        organization_id: ObjectId,
        role: str = "user"
    ) -> dict:
        """Create user with organization (for invitation acceptance)"""
        # Check if user already exists
        existing = self.collection.find_one({"email": email})
        if existing:
            raise ValueError("Email already registered")

        user = {
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "password": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            "organizations": [{
                "organization_id": organization_id,
                "role": role,
                "status": "active"
            }],
            "current_organization_id": organization_id,
            "auth_method": "email",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }

        result = self.collection.insert_one(user)
        user["_id"] = result.inserted_id
        return user

    def get_by_id(self, user_id: ObjectId) -> dict:
        """Get user by ObjectId"""
        return self.collection.find_one({"_id": user_id})

    def remove_from_organization(self, user_id: ObjectId):
        """Remove user from organization (soft delete)"""
        self.collection.update_one(
            {"_id": user_id},
            {"$set": {"status": "removed", "updatedAt": datetime.utcnow()}}
        )


def get_user_crud() -> UserCRUD:
    """
    Get or create UserCRUD instance (singleton pattern)

    Returns:
        UserCRUD instance
    """
    global _user_crud
    with _lock:
        if _user_crud is None:
            _user_crud = UserCRUD()
        return _user_crud
