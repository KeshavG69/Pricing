"""
Invitation CRUD operations with MongoDB (Async).

Handles invitation creation, validation, acceptance, and revocation.
Uses token hashing for security - plain tokens never stored in database.
"""

from bson import ObjectId
from datetime import datetime, timedelta
import secrets
import hashlib
import asyncio
from auth.database import MongoDB
from client.email_service import EmailService


# Global singleton instance
_invitation_crud = None
_lock = asyncio.Lock()


class InvitationCRUD:
    """Invitation CRUD operations with token hashing (Async Singleton)"""

    def __init__(self):
        """Initialize InvitationCRUD (lazy initialization for database)"""
        self.db = None
        self.collection = None
        self.users_collection = None
        self.orgs_collection = None
        self.email_service = EmailService()

    async def _ensure_initialized(self):
        """Ensure database connection is initialized"""
        if self.db is None:
            self.db = await MongoDB.get_database()
            self.collection = self.db["invitations"]
            self.users_collection = await MongoDB.get_users_collection()
            self.orgs_collection = self.db["organizations"]

    @staticmethod
    def _hash_token(token: str) -> str:
        """
        Hash invitation token using SHA-256
        Security: NEVER store plain tokens in database
        """
        return hashlib.sha256(token.encode()).hexdigest()

    async def create_invitation(
        self,
        org_id: ObjectId,
        email: str,
        role: str,
        invited_by: ObjectId
    ) -> dict:
        """Create and send invitation (async)"""
        await self._ensure_initialized()

        # Check for duplicate pending invitation
        existing = await self.collection.find_one({
            "organization_id": org_id,
            "email": email,
            "status": "pending"
        })
        if existing:
            raise ValueError("User already has a pending invitation")

        # Check if user already exists in THIS organization
        existing_user = await self.users_collection.find_one({
            "email": email,
            "organization_id": org_id
        })
        if existing_user:
            raise ValueError("User is already a member of this organization")

        # Generate secure random token
        token = secrets.token_urlsafe(48)  # 64 characters
        token_hash = self._hash_token(token)

        # Get inviter and org details for email
        inviter = await self.users_collection.find_one({"_id": invited_by})
        org = await self.orgs_collection.find_one({"_id": org_id})

        invitation = {
            "organization_id": org_id,
            "email": email,
            "role": role,
            "invited_by": invited_by,
            "invited_by_name": f"{inviter['firstName']} {inviter['lastName']}",
            "organization_name": org["name"],
            "token_hash": token_hash,  # Store hash, NOT plain token
            "status": "pending",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=7),
            "accepted_at": None
        }

        result = await self.collection.insert_one(invitation)
        invitation["_id"] = result.inserted_id

        # Send email with plain token (only time it's visible)
        try:
            self.email_service.send_invitation_email(
                to_email=email,
                token=token,  # Send plain token in email
                organization_name=org["name"],
                invited_by_name=invitation["invited_by_name"]
            )
        except Exception as e:
            print(f"Failed to send invitation email: {e}")
            # Don't fail the invitation creation if email fails

        return invitation

    async def validate_token(self, token: str) -> dict:
        """Validate invitation token (async)"""
        await self._ensure_initialized()

        token_hash = self._hash_token(token)
        invitation = await self.collection.find_one({"token_hash": token_hash})

        if not invitation:
            raise ValueError("Invalid invitation token")

        if invitation["status"] != "pending":
            raise ValueError("Invitation has already been used")

        if datetime.utcnow() > invitation["expires_at"]:
            # Mark as expired
            await self.collection.update_one(
                {"_id": invitation["_id"]},
                {"$set": {"status": "expired"}}
            )
            raise ValueError("Invitation has expired")

        return invitation

    async def accept_invitation(self, token: str, user_id: ObjectId):
        """Mark invitation as accepted (async)"""
        await self._ensure_initialized()

        token_hash = self._hash_token(token)
        result = await self.collection.update_one(
            {"token_hash": token_hash, "status": "pending"},
            {
                "$set": {
                    "status": "accepted",
                    "accepted_by": user_id,
                    "accepted_at": datetime.utcnow()
                }
            }
        )

        if result.modified_count == 0:
            raise ValueError("Invalid or already used invitation")

    async def get_pending(self, org_id: ObjectId) -> list:
        """Get all pending invitations for organization (async)"""
        await self._ensure_initialized()

        cursor = self.collection.find({
            "organization_id": org_id,
            "status": "pending"
        }).sort("created_at", -1)

        return await cursor.to_list(length=None)

    async def revoke_invitation(self, invitation_id: ObjectId, org_id: ObjectId) -> bool:
        """Revoke/cancel invitation (async)"""
        await self._ensure_initialized()

        result = await self.collection.update_one(
            {
                "_id": invitation_id,
                "organization_id": org_id,
                "status": "pending"
            },
            {
                "$set": {
                    "status": "revoked",
                    "revoked_at": datetime.utcnow()
                }
            }
        )

        return result.modified_count > 0


async def get_invitation_crud() -> InvitationCRUD:
    """
    Get or create InvitationCRUD instance (singleton pattern) - async

    Returns:
        InvitationCRUD instance
    """
    global _invitation_crud
    async with _lock:
        if _invitation_crud is None:
            _invitation_crud = InvitationCRUD()
        return _invitation_crud
