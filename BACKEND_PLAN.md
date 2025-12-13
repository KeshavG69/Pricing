# Backend User Management System - Complete Implementation Plan

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [File Structure](#file-structure)
4. [Core CRUD Classes](#core-crud-classes)
5. [API Endpoints](#api-endpoints)
6. [Authentication & Security](#authentication--security)
7. [Helper Functions](#helper-functions)
8. [Migration Scripts](#migration-scripts)
9. [Implementation Checklist](#implementation-checklist)

---

## Overview

### What We're Building
A multi-tenant organization system where:
- Each organization has admins and users
- Admins can invite users, manage proposals, and configure settings
- Users see only their own proposals + explicitly shared ones
- Complete data isolation between organizations

### Key Design Decisions
✅ **ObjectIds everywhere** - Fast lookups, less storage
✅ **No Pydantic response models** - Return plain dicts, FastAPI auto-converts to JSON
✅ **Singleton CRUD classes** - Thread-safe, reusable
✅ **Simple helper function** - Convert ObjectIds to strings in one place

---

## Database Schema

### 1. Organizations Collection (NEW)

```javascript
{
  "_id": ObjectId("507f191e810c19729de860ea"),
  "name": "Acme Defense Contractors",
  "slug": "acme-defense",
  "owner_id": ObjectId("507f1f77bcf86cd799439011"),
  "created_at": ISODate("2025-01-15"),
  "updated_at": ISODate("2025-01-15"),
  "status": "active",  // or "suspended"

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
    "default_escalation_rates": {
      "1_to_2": 0.0272,
      "2_to_3": 0.0272,
      // ... up to total_years
    },
    "fte_threshold": 1920,
    "allow_user_rate_override": true
  },

  "subscription": {
    "plan": "free",  // "free", "professional", "enterprise"
    "seats": 5,
    "expires_at": null
  }
}
```

**Indexes**:
```python
db.organizations.create_index([("slug", 1)], unique=True)
db.organizations.create_index([("owner_id", 1)])
db.organizations.create_index([("status", 1)])
```

---

### 2. Users Collection (UPDATE)

**Add these new fields**:
```javascript
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "firstName": "Sarah",
  "lastName": "Johnson",
  "email": "sarah@example.com",
  "password": "bcrypt_hash",
  "auth_method": "email",  // or "google"

  // NEW FIELDS:
  "organization_id": ObjectId("507f191e810c19729de860ea"),
  "role": "admin",  // "admin" or "user"
  "status": "active",  // "active", "suspended", "invited"

  "createdAt": ISODate("2025-01-15"),
  "updatedAt": ISODate("2025-01-15"),
  "last_login": ISODate("2025-01-15")
}
```

**New Indexes**:
```python
db.users.create_index([("email", 1)], unique=True)  # Existing
db.users.create_index([("organization_id", 1), ("role", 1)])  # NEW
db.users.create_index([("organization_id", 1), ("status", 1)])  # NEW
```

---

### 3. Invitations Collection (NEW)

```javascript
{
  "_id": ObjectId(),
  "organization_id": ObjectId("507f191e810c19729de860ea"),
  "email": "mike@example.com",
  "role": "user",  // Role they'll get when they join
  "invited_by": ObjectId("507f1f77bcf86cd799439011"),
  "invited_by_name": "Sarah Johnson",  // For display
  "organization_name": "Acme Defense Contractors",  // For display

  "token_hash": "a3b2c1...",  // SHA-256 hash of token (security: never store plain tokens)
  "status": "pending",  // "pending", "accepted", "expired", "revoked"

  "created_at": ISODate("2025-01-15"),
  "expires_at": ISODate("2025-01-22"),  // 7 days from creation
  "accepted_at": null
}
```

**Indexes**:
```python
db.invitations.create_index([("token_hash", 1)], unique=True)
db.invitations.create_index([("organization_id", 1), ("status", 1)])
db.invitations.create_index([("email", 1), ("status", 1)])
db.invitations.create_index([("expires_at", 1)], expireAfterSeconds=0)  # TTL index
```

---

### 4. Proposals Collection (UPDATE)

**Add these new fields**:
```javascript
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "user_id": ObjectId("507f1f77bcf86cd799439011"),
  "name": "Navy Contract 2025",

  // NEW FIELDS:
  "organization_id": ObjectId("507f191e810c19729de860ea"),
  "visibility": "private",  // "private", "organization", "shared"
  "shared_with": [  // Array of user ObjectIds
    ObjectId("507f1f77bcf86cd799439013"),
    ObjectId("507f1f77bcf86cd799439014")
  ],

  // Existing fields
  "status": "completed",
  "solicitation_number": "N00000R0000",
  "jobs": [...],
  "rates": {...},
  "created_at": ISODate("2025-01-15"),
  "updated_at": ISODate("2025-01-15")
}
```

**New Indexes**:
```python
db.proposals.create_index([("user_id", 1), ("created_at", -1)])  # Existing
db.proposals.create_index([("organization_id", 1), ("created_at", -1)])  # NEW
db.proposals.create_index([("organization_id", 1), ("visibility", 1)])  # NEW
db.proposals.create_index([("shared_with", 1)])  # NEW - for array lookups
```

---

## File Structure

```
backend/
├── auth/
│   ├── dependencies.py          # NEW: get_current_user, require_admin
│   ├── rbac.py                  # NEW: can_access_proposal
│   ├── models.py                # MODIFY: Add Organization, Invitation Pydantic models
│   ├── utils.py                 # Existing: JWT functions
│   └── crud.py                  # Existing: User CRUD
│
├── routers/
│   ├── organizations.py         # NEW: Organization management endpoints
│   ├── invitations.py           # NEW: Invitation endpoints
│   ├── proposals.py             # MODIFY: Add sharing endpoints
│   └── auth.py                  # MODIFY: Update signup
│
├── utils/
│   ├── helpers.py               # NEW: serialize_doc function
│   ├── organizations.py         # NEW: OrganizationCRUD class
│   ├── invitations.py           # NEW: InvitationCRUD class
│   └── proposals.py             # MODIFY: Update ProposalCRUD
│
├── services/
│   └── email_service.py         # NEW: Email sending
│
├── scripts/
│   ├── migrate_to_organizations.py   # NEW: One-time migration
│   └── create_indexes.py             # NEW: Create all indexes
│
└── main.py                      # MODIFY: Register new routers
```

---

## Core CRUD Classes

### 1. Helper Functions (`utils/helpers.py`)

```python
from bson import ObjectId

def serialize_doc(doc: dict) -> dict:
    """
    Convert MongoDB document to JSON-serializable dict
    Converts ObjectIds to strings, _id to id
    """
    if not doc:
        return None

    # Convert _id to id
    if "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]

    # Convert all ObjectId fields to strings
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, list):
            # Handle arrays of ObjectIds (like shared_with)
            doc[key] = [str(v) if isinstance(v, ObjectId) else v for v in value]
        elif isinstance(value, dict):
            # Recursive for nested documents
            doc[key] = serialize_doc(value)
        elif isinstance(value, datetime):
            # Convert datetime to ISO string
            doc[key] = value.isoformat()

    return doc

def serialize_docs(docs: list) -> list:
    """Convert list of MongoDB documents"""
    return [serialize_doc(doc.copy()) for doc in docs]
```

---

### 2. OrganizationCRUD (`utils/organizations.py`)

```python
from bson import ObjectId
from datetime import datetime
import threading
from auth.database import MongoDB

class OrganizationCRUD:
    """Singleton class for organization operations"""
    _instance = None
    _lock = threading.RLock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.db = MongoDB.get_database()
            self.collection = self.db["organizations"]
            self.users_collection = self.db["users"]
            self.initialized = True

    def create_organization(self, name: str, owner_id: ObjectId) -> dict:
        """Create a new organization"""
        slug = self._generate_slug(name)

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
                "default_escalation_rates": {},
                "fte_threshold": 1920,
                "allow_user_rate_override": True
            },
            "subscription": {
                "plan": "free",
                "seats": 5,
                "expires_at": None
            }
        }

        result = self.collection.insert_one(org)
        org["_id"] = result.inserted_id
        return org

    def get_by_id(self, org_id: ObjectId) -> dict:
        """Get organization by ObjectId"""
        return self.collection.find_one({"_id": org_id})

    def get_by_slug(self, slug: str) -> dict:
        """Get organization by slug"""
        return self.collection.find_one({"slug": slug})

    def update_settings(self, org_id: ObjectId, settings: dict) -> dict:
        """Update organization settings"""
        self.collection.update_one(
            {"_id": org_id},
            {
                "$set": {
                    "settings": settings,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        return self.get_by_id(org_id)

    def get_members(self, org_id: ObjectId, role: str = None) -> list:
        """Get all users in organization"""
        query = {"organization_id": org_id, "status": "active"}
        if role:
            query["role"] = role

        members = self.users_collection.find(query).sort("firstName", 1)
        return list(members)

    def set_owner(self, org_id: ObjectId, owner_id: ObjectId):
        """Update organization owner"""
        self.collection.update_one(
            {"_id": org_id},
            {"$set": {"owner_id": owner_id, "updated_at": datetime.utcnow()}}
        )

    def _generate_slug(self, name: str) -> str:
        """Generate URL-friendly slug from organization name"""
        import re
        slug = name.lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = slug.strip('-')

        # Check for uniqueness
        counter = 1
        original_slug = slug
        while self.collection.find_one({"slug": slug}):
            slug = f"{original_slug}-{counter}"
            counter += 1

        return slug
```

---

### 3. InvitationCRUD (`utils/invitations.py`)

```python
from bson import ObjectId
from datetime import datetime, timedelta
import secrets
import hashlib
import threading
from auth.database import MongoDB
from services.email_service import EmailService

class InvitationCRUD:
    """Singleton class for invitation operations"""
    _instance = None
    _lock = threading.RLock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.db = MongoDB.get_database()
            self.collection = self.db["invitations"]
            self.users_collection = self.db["users"]
            self.orgs_collection = self.db["organizations"]
            self.email_service = EmailService()
            self.initialized = True

    @staticmethod
    def _hash_token(token: str) -> str:
        """
        Hash invitation token using SHA-256
        Security: Never store plain tokens in database
        """
        return hashlib.sha256(token.encode()).hexdigest()

    def create_invitation(
        self,
        org_id: ObjectId,
        email: str,
        role: str,
        invited_by: ObjectId
    ) -> dict:
        """Create and send invitation"""

        # Check for duplicate pending invitation
        existing = self.collection.find_one({
            "organization_id": org_id,
            "email": email,
            "status": "pending"
        })
        if existing:
            raise ValueError("User already has a pending invitation")

        # Check if user already exists with this email
        existing_user = self.users_collection.find_one({"email": email})
        if existing_user:
            raise ValueError("User with this email already exists")

        # Generate secure random token
        token = secrets.token_urlsafe(48)  # 64 characters
        token_hash = self._hash_token(token)

        # Get inviter and org details for email
        inviter = self.users_collection.find_one({"_id": invited_by})
        org = self.orgs_collection.find_one({"_id": org_id})

        invitation = {
            "organization_id": org_id,
            "email": email,
            "role": role,
            "invited_by": invited_by,
            "invited_by_name": f"{inviter['firstName']} {inviter['lastName']}",
            "organization_name": org["name"],
            "token_hash": token_hash,  # Store hash, not plain token
            "status": "pending",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=7),
            "accepted_at": None
        }

        result = self.collection.insert_one(invitation)
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

    def validate_token(self, token: str) -> dict:
        """Validate invitation token"""
        token_hash = self._hash_token(token)
        invitation = self.collection.find_one({"token_hash": token_hash})

        if not invitation:
            raise ValueError("Invalid invitation token")

        if invitation["status"] != "pending":
            raise ValueError("Invitation has already been used")

        if datetime.utcnow() > invitation["expires_at"]:
            # Mark as expired
            self.collection.update_one(
                {"_id": invitation["_id"]},
                {"$set": {"status": "expired"}}
            )
            raise ValueError("Invitation has expired")

        return invitation

    def accept_invitation(self, token: str, user_id: ObjectId):
        """Mark invitation as accepted"""
        token_hash = self._hash_token(token)
        result = self.collection.update_one(
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

    def get_pending(self, org_id: ObjectId) -> list:
        """Get all pending invitations for organization"""
        invitations = self.collection.find({
            "organization_id": org_id,
            "status": "pending"
        }).sort("created_at", -1)

        return list(invitations)

    def revoke_invitation(self, invitation_id: ObjectId, org_id: ObjectId) -> bool:
        """Revoke/cancel invitation"""
        result = self.collection.update_one(
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
```

---

### 4. Updated ProposalCRUD (`utils/proposals.py`)

**Add these methods to existing ProposalCRUD class**:

```python
from bson import ObjectId

class ProposalCRUD:
    # ... existing code ...

    def get_user_proposals(
        self,
        user_id: ObjectId,
        organization_id: ObjectId,
        role: str
    ) -> list:
        """
        Get proposals based on user's role
        Admin: All org proposals
        User: Own proposals + shared proposals
        """

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

        proposals = self.collection.find(query).sort("created_at", -1)
        return list(proposals)

    def share_proposal(
        self,
        proposal_id: ObjectId,
        user_ids: list[ObjectId],
        admin_id: ObjectId
    ) -> dict:
        """Share proposal with specific users (admin only)"""

        # Get proposal
        proposal = self.get_by_id(proposal_id)
        if not proposal:
            raise ValueError("Proposal not found")

        # Get admin user to verify org
        admin = self.db["users"].find_one({"_id": admin_id})

        # Verify proposal belongs to admin's org
        if proposal["organization_id"] != admin["organization_id"]:
            raise ValueError("Cannot share proposals from other organizations")

        # Verify all user_ids belong to same org
        for user_id in user_ids:
            user = self.db["users"].find_one({"_id": user_id})
            if not user:
                raise ValueError(f"User {user_id} not found")
            if user["organization_id"] != admin["organization_id"]:
                raise ValueError(f"User {user['email']} not in your organization")

        # Update proposal
        self.collection.update_one(
            {"_id": proposal_id},
            {
                "$set": {
                    "visibility": "shared",
                    "shared_with": user_ids,
                    "updated_at": datetime.utcnow()
                }
            }
        )

        return self.get_by_id(proposal_id)

    def unshare_proposal(
        self,
        proposal_id: ObjectId,
        user_id: ObjectId
    ) -> dict:
        """Remove user from shared list"""

        self.collection.update_one(
            {"_id": proposal_id},
            {
                "$pull": {"shared_with": user_id},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )

        # If no more users, set visibility to private
        proposal = self.get_by_id(proposal_id)
        if len(proposal.get("shared_with", [])) == 0:
            self.collection.update_one(
                {"_id": proposal_id},
                {"$set": {"visibility": "private"}}
            )

        return self.get_by_id(proposal_id)

    def create_proposal(self, user_id: ObjectId, organization_id: ObjectId, **kwargs) -> dict:
        """Create proposal with organization_id"""
        proposal = {
            "user_id": user_id,
            "organization_id": organization_id,
            "visibility": "private",
            "shared_with": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            **kwargs
        }

        result = self.collection.insert_one(proposal)
        proposal["_id"] = result.inserted_id
        return proposal
```

---

### 5. Updated UserCRUD (`auth/crud.py`)

**Add these methods to existing UserCRUD**:

```python
from bson import ObjectId

class UserCRUD:
    # ... existing code ...

    def create_user(
        self,
        email: str,
        first_name: str,
        last_name: str,
        password: str,
        organization_id: ObjectId,
        role: str = "user"
    ) -> dict:
        """Create user with organization"""

        # Check if email exists
        existing = self.collection.find_one({"email": email})
        if existing:
            raise ValueError("Email already registered")

        import bcrypt
        user = {
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "password": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            "organization_id": organization_id,
            "role": role,
            "status": "active",
            "auth_method": "email",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }

        result = self.collection.insert_one(user)
        user["_id"] = result.inserted_id
        return user

    def remove_from_organization(self, user_id: ObjectId):
        """Remove user from organization (soft delete)"""
        self.collection.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "status": "removed",
                    "updatedAt": datetime.utcnow()
                }
            }
        )
```

---

## API Endpoints

### 1. Organizations Router (`routers/organizations.py`)

```python
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from auth.dependencies import get_current_user, require_admin
from utils.helpers import serialize_doc, serialize_docs
from utils.organizations import OrganizationCRUD
from utils.users import UserCRUD

router = APIRouter(prefix="/api/organizations", tags=["organizations"])
org_crud = OrganizationCRUD()
user_crud = UserCRUD()

@router.get("/me")
async def get_my_organization(current_user: dict = Depends(get_current_user)):
    """Get current user's organization"""
    org = org_crud.get_by_id(current_user["organization_id"])
    if not org:
        raise HTTPException(404, "Organization not found")
    return serialize_doc(org)

@router.get("/me/members")
async def get_organization_members(current_user: dict = Depends(require_admin)):
    """List all members (admin only)"""
    members = org_crud.get_members(current_user["organization_id"])
    return serialize_docs(members)

@router.patch("/me/settings")
async def update_settings(
    settings: dict,
    current_user: dict = Depends(require_admin)
):
    """Update org settings (admin only)"""
    updated_org = org_crud.update_settings(
        current_user["organization_id"],
        settings
    )
    return serialize_doc(updated_org)

@router.delete("/members/{user_id}")
async def remove_member(
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Remove user from organization (admin only)"""
    try:
        user_oid = ObjectId(user_id)
    except:
        raise HTTPException(400, "Invalid user ID")

    if str(current_user["_id"]) == user_id:
        raise HTTPException(400, "Cannot remove yourself")

    user = user_crud.get_by_id(user_oid)
    if not user:
        raise HTTPException(404, "User not found")

    if user["organization_id"] != current_user["organization_id"]:
        raise HTTPException(403, "User not in your organization")

    user_crud.remove_from_organization(user_oid)
    return {"message": "User removed successfully"}
```

---

### 2. Invitations Router (`routers/invitations.py`)

```python
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from pydantic import BaseModel, EmailStr
from auth.dependencies import get_current_user, require_admin
from utils.helpers import serialize_doc, serialize_docs
from utils.invitations import InvitationCRUD
from utils.users import UserCRUD

router = APIRouter(prefix="/api/invitations", tags=["invitations"])
inv_crud = InvitationCRUD()
user_crud = UserCRUD()

class InviteRequest(BaseModel):
    email: EmailStr
    role: str

class AcceptInvitationRequest(BaseModel):
    token: str
    firstName: str
    lastName: str
    password: str

@router.post("")
async def send_invitation(
    data: InviteRequest,
    current_user: dict = Depends(require_admin)
):
    """Send invitation (admin only)"""
    try:
        invitation = inv_crud.create_invitation(
            org_id=current_user["organization_id"],
            email=data.email,
            role=data.role,
            invited_by=current_user["_id"]
        )
        return serialize_doc(invitation)
    except ValueError as e:
        raise HTTPException(400, str(e))

@router.get("")
async def list_invitations(current_user: dict = Depends(require_admin)):
    """Get all pending invitations (admin only)"""
    invitations = inv_crud.get_pending(current_user["organization_id"])
    return serialize_docs(invitations)

@router.delete("/{invitation_id}")
async def revoke_invitation(
    invitation_id: str,
    current_user: dict = Depends(require_admin)
):
    """Revoke invitation (admin only)"""
    try:
        inv_oid = ObjectId(invitation_id)
    except:
        raise HTTPException(400, "Invalid invitation ID")

    success = inv_crud.revoke_invitation(inv_oid, current_user["organization_id"])
    if not success:
        raise HTTPException(404, "Invitation not found")

    return {"message": "Invitation revoked"}

@router.get("/validate/{token}")
async def validate_token(token: str):
    """Validate invitation token (public endpoint)"""
    try:
        invitation = inv_crud.validate_token(token)
        return serialize_doc(invitation)
    except ValueError as e:
        raise HTTPException(400, str(e))

@router.post("/accept")
async def accept_invitation(data: AcceptInvitationRequest):
    """Accept invitation and create account (public endpoint)"""
    try:
        # Validate token
        invitation = inv_crud.validate_token(data.token)

        # Create user
        user = user_crud.create_user(
            email=invitation["email"],
            first_name=data.firstName,
            last_name=data.lastName,
            password=data.password,
            organization_id=invitation["organization_id"],
            role=invitation["role"]
        )

        # Mark invitation as accepted
        inv_crud.accept_invitation(data.token, user["_id"])

        # Generate tokens
        from auth.utils import create_access_token, create_refresh_token
        access_token = create_access_token(user["_id"])
        refresh_token = create_refresh_token(user["_id"])

        return {
            "user": serialize_doc(user),
            "access_token": access_token,
            "refresh_token": refresh_token
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
```

---

### 3. Updated Proposals Router (`routers/proposals.py`)

**Add these endpoints to existing router**:

```python
from pydantic import BaseModel

class ShareProposalRequest(BaseModel):
    user_ids: list[str]

@router.get("")
async def get_proposals(current_user: dict = Depends(get_current_user)):
    """Get user's proposals (filtered by role)"""
    proposals = proposal_crud.get_user_proposals(
        user_id=current_user["_id"],
        organization_id=current_user["organization_id"],
        role=current_user["role"]
    )
    return serialize_docs(proposals)

@router.post("/{proposal_id}/share")
async def share_proposal(
    proposal_id: str,
    data: ShareProposalRequest,
    current_user: dict = Depends(require_admin)
):
    """Share proposal with users (admin only)"""
    try:
        prop_oid = ObjectId(proposal_id)
        user_oids = [ObjectId(uid) for uid in data.user_ids]
    except:
        raise HTTPException(400, "Invalid ID format")

    try:
        updated = proposal_crud.share_proposal(
            proposal_id=prop_oid,
            user_ids=user_oids,
            admin_id=current_user["_id"]
        )
        return serialize_doc(updated)
    except ValueError as e:
        raise HTTPException(400, str(e))

@router.delete("/{proposal_id}/share/{user_id}")
async def unshare_proposal(
    proposal_id: str,
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Unshare proposal from user (admin only)"""
    try:
        prop_oid = ObjectId(proposal_id)
        user_oid = ObjectId(user_id)
    except:
        raise HTTPException(400, "Invalid ID format")

    updated = proposal_crud.unshare_proposal(prop_oid, user_oid)
    return serialize_doc(updated)

@router.get("/{proposal_id}/shared-with")
async def get_shared_users(
    proposal_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of users this proposal is shared with"""
    try:
        prop_oid = ObjectId(proposal_id)
    except:
        raise HTTPException(400, "Invalid proposal ID")

    proposal = proposal_crud.get_by_id(prop_oid)
    if not proposal:
        raise HTTPException(404, "Proposal not found")

    # Check access
    from auth.rbac import can_access_proposal
    if not can_access_proposal(proposal, current_user):
        raise HTTPException(403, "Access denied")

    # Get user details
    shared_users = []
    for user_id in proposal.get("shared_with", []):
        user = user_crud.get_by_id(user_id)
        if user:
            shared_users.append({
                "id": str(user["_id"]),
                "firstName": user["firstName"],
                "lastName": user["lastName"],
                "email": user["email"]
            })

    return shared_users
```

---

## Authentication & Security

### 1. Auth Dependencies (`auth/dependencies.py`)

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
import jwt
from config import settings
from auth.crud import UserCRUD

security = HTTPBearer()
user_crud = UserCRUD()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Get current user from JWT token"""
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=["HS256"]
        )

        user_id_str = payload.get("user_id")
        if not user_id_str:
            raise HTTPException(401, "Invalid token")

        user_id = ObjectId(user_id_str)
        user = user_crud.get_by_id(user_id)

        if not user:
            raise HTTPException(401, "User not found")

        if user.get("status") != "active":
            raise HTTPException(403, "Account suspended")

        return user

    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    except Exception as e:
        raise HTTPException(401, f"Authentication failed: {str(e)}")

async def require_admin(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Require admin role"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user
```

---

### 2. RBAC Functions (`auth/rbac.py`)

```python
from bson import ObjectId

def can_access_proposal(proposal: dict, user: dict) -> bool:
    """Check if user can access proposal"""

    # Must be same organization
    if proposal["organization_id"] != user["organization_id"]:
        return False

    # Admin can access all org proposals
    if user["role"] == "admin":
        return True

    # Owner can access their proposals
    if proposal["user_id"] == user["_id"]:
        return True

    # Check if explicitly shared
    if user["_id"] in proposal.get("shared_with", []):
        return True

    return False

def require_same_org(resource_org_id: ObjectId, user_org_id: ObjectId):
    """Verify resource belongs to user's organization"""
    if resource_org_id != user_org_id:
        raise ValueError("Resource belongs to different organization")
```

---

### 3. Email Service (`services/email_service.py`)

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings

class EmailService:
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL
        self.frontend_url = settings.FRONTEND_URL

    def send_invitation_email(
        self,
        to_email: str,
        token: str,
        organization_name: str,
        invited_by_name: str
    ):
        """Send organization invitation email"""
        invitation_url = f"{self.frontend_url}/invite/accept?token={token}"

        html = f"""
        <html>
        <body>
            <h2>You've been invited to join {organization_name}</h2>
            <p>{invited_by_name} has invited you to collaborate on PriceIQ.</p>
            <p>
                <a href="{invitation_url}"
                   style="background-color: #4CAF50; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 4px; display: inline-block;">
                    Accept Invitation
                </a>
            </p>
            <p style="color: #666; font-size: 12px;">
                This invitation expires in 7 days.<br>
                If you didn't expect this invitation, you can safely ignore this email.
            </p>
        </body>
        </html>
        """

        message = MIMEMultipart("alternative")
        message["Subject"] = f"Invitation to join {organization_name}"
        message["From"] = self.from_email
        message["To"] = to_email

        html_part = MIMEText(html, "html")
        message.attach(html_part)

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(message)
        except Exception as e:
            print(f"Failed to send email: {e}")
            raise
```

**Add to `config.py`**:
```python
class Settings(BaseSettings):
    # ... existing settings ...

    # Email configuration
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "noreply@priceiq.com"
    FRONTEND_URL: str = "http://localhost:3000"
```

---

## Helper Functions

Already covered in section above (`utils/helpers.py`)

---

## Migration Scripts

### 1. Create Indexes (`scripts/create_indexes.py`)

```python
from pymongo import ASCENDING, DESCENDING
from auth.database import MongoDB

def create_indexes():
    """Create all required indexes"""
    db = MongoDB.get_database()

    print("Creating indexes...")

    # Users collection
    db.users.create_index([("email", ASCENDING)], unique=True)
    db.users.create_index([("organization_id", ASCENDING), ("role", ASCENDING)])
    db.users.create_index([("organization_id", ASCENDING), ("status", ASCENDING)])
    print("✅ Users indexes created")

    # Organizations collection
    db.organizations.create_index([("slug", ASCENDING)], unique=True)
    db.organizations.create_index([("owner_id", ASCENDING)])
    db.organizations.create_index([("status", ASCENDING)])
    print("✅ Organizations indexes created")

    # Proposals collection
    db.proposals.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    db.proposals.create_index([("organization_id", ASCENDING), ("created_at", DESCENDING)])
    db.proposals.create_index([("organization_id", ASCENDING), ("visibility", ASCENDING)])
    db.proposals.create_index([("shared_with", ASCENDING)])
    print("✅ Proposals indexes created")

    # Invitations collection
    db.invitations.create_index([("token", ASCENDING)], unique=True)
    db.invitations.create_index([("organization_id", ASCENDING), ("status", ASCENDING)])
    db.invitations.create_index([("email", ASCENDING), ("status", ASCENDING)])
    db.invitations.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
    print("✅ Invitations indexes created")

    print("\n✅ All indexes created successfully!")

if __name__ == "__main__":
    create_indexes()
```

---

### 2. Migration Script (`scripts/migrate_to_organizations.py`)

```python
from bson import ObjectId
from datetime import datetime
from auth.database import MongoDB

def migrate_to_organizations():
    """
    Migrate existing users and proposals to organization system
    """
    db = MongoDB.get_database()

    print("=" * 60)
    print("MIGRATION: Adding Organization Support")
    print("=" * 60)

    # Step 1: Get all existing users
    print("\n[1/4] Processing existing users...")
    users = list(db.users.find({}))
    user_org_mapping = {}

    for user in users:
        # Skip if already has organization_id
        if "organization_id" in user:
            print(f"  ⏭️  User {user['email']} already migrated")
            user_org_mapping[user["_id"]] = user["organization_id"]
            continue

        # Create organization for each user
        org_name = f"{user['firstName']} {user['lastName']}'s Organization"
        org = {
            "name": org_name,
            "slug": f"org-{user['_id']}",
            "owner_id": user["_id"],
            "created_at": user.get("createdAt", datetime.utcnow()),
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
                "default_escalation_rates": {},
                "fte_threshold": 1920,
                "allow_user_rate_override": True
            },
            "subscription": {
                "plan": "free",
                "seats": 5,
                "expires_at": None
            }
        }

        result = db.organizations.insert_one(org)
        org_id = result.inserted_id
        user_org_mapping[user["_id"]] = org_id

        print(f"  ✅ Created org '{org_name}' for {user['email']}")

    # Step 2: Update users with organization_id and role
    print("\n[2/4] Updating users...")
    for user_id, org_id in user_org_mapping.items():
        db.users.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "organization_id": org_id,
                    "role": "admin",  # Existing users become admins
                    "status": "active",
                    "updatedAt": datetime.utcnow()
                }
            }
        )
        print(f"  ✅ Updated user {user_id}")

    # Step 3: Update proposals with organization_id
    print("\n[3/4] Updating proposals...")
    proposals = list(db.proposals.find({}))

    for proposal in proposals:
        # Skip if already has organization_id
        if "organization_id" in proposal:
            print(f"  ⏭️  Proposal {proposal['_id']} already migrated")
            continue

        user_id = proposal.get("user_id")
        if user_id not in user_org_mapping:
            print(f"  ⚠️  Proposal {proposal['_id']} has unknown user_id, skipping")
            continue

        org_id = user_org_mapping[user_id]

        db.proposals.update_one(
            {"_id": proposal["_id"]},
            {
                "$set": {
                    "organization_id": org_id,
                    "visibility": "private",
                    "shared_with": [],
                    "updated_at": datetime.utcnow()
                }
            }
        )
        print(f"  ✅ Updated proposal {proposal['_id']}")

    # Step 4: Create indexes
    print("\n[4/4] Creating indexes...")
    from scripts.create_indexes import create_indexes
    create_indexes()

    print("\n" + "=" * 60)
    print("✅ MIGRATION COMPLETED SUCCESSFULLY")
    print("=" * 60)
    print(f"  Organizations created: {len(user_org_mapping)}")
    print(f"  Users updated: {len(users)}")
    print(f"  Proposals updated: {len(proposals)}")
    print("=" * 60)

if __name__ == "__main__":
    try:
        migrate_to_organizations()
    except Exception as e:
        print(f"\n❌ MIGRATION FAILED: {e}")
        import traceback
        traceback.print_exc()
```

**To run migration**:
```bash
cd backend
python -m scripts.migrate_to_organizations
```

---

## Implementation Checklist

### Week 1: Database & Core Classes
- [ ] Create `utils/helpers.py` with `serialize_doc` function
- [ ] Create `utils/organizations.py` with `OrganizationCRUD` class
- [ ] Create `utils/invitations.py` with `InvitationCRUD` class
- [ ] Update `auth/crud.py` - add `create_user` and `remove_from_organization`
- [ ] Update `utils/proposals.py` - add organization scoping methods
- [ ] Create `services/email_service.py` with email sending
- [ ] Add email settings to `config.py`
- [ ] Test all CRUD classes in isolation

### Week 2: Security & Middleware
- [ ] Create `auth/dependencies.py` with `get_current_user` and `require_admin`
- [ ] Create `auth/rbac.py` with `can_access_proposal`
- [ ] Update JWT token creation to include ObjectId serialization
- [ ] Test authentication flow with new dependencies

### Week 3: API Endpoints
- [ ] Create `routers/organizations.py` - all endpoints
- [ ] Create `routers/invitations.py` - all endpoints
- [ ] Update `routers/proposals.py` - add sharing endpoints
- [ ] Update `routers/auth.py` - modify signup for invitations
- [ ] Register new routers in `main.py`
- [ ] Test all endpoints with Postman/curl

### Week 4: Migration & Indexes
- [ ] Create `scripts/create_indexes.py`
- [ ] Create `scripts/migrate_to_organizations.py`
- [ ] **BACKUP PRODUCTION DATABASE**
- [ ] Test migration on development database
- [ ] Run migration on staging database
- [ ] Verify data integrity after migration

### Week 5: Testing & Refinement
- [ ] Test admin invitation flow end-to-end
- [ ] Test user accepting invitation
- [ ] Test proposal sharing/unsharing
- [ ] Test permission boundaries (users can't see others' proposals)
- [ ] Test organization isolation (can't access other orgs)
- [ ] Load testing with multiple orgs and users

### Week 6: Production Deployment
- [ ] Deploy backend changes to production
- [ ] Run migration script on production database
- [ ] Monitor logs for errors
- [ ] Send announcement to existing users
- [ ] Document API endpoints

---

## Testing Examples

### Test Organization Creation
```bash
# Create organization
POST /api/organizations
Authorization: Bearer <admin_token>
{
  "name": "Acme Defense",
  "owner_id": "507f1f77bcf86cd799439011"
}
```

### Test Invitation Flow
```bash
# 1. Admin sends invitation
POST /api/invitations
Authorization: Bearer <admin_token>
{
  "email": "mike@example.com",
  "role": "user"
}

# 2. Validate token (Mike clicks email link)
GET /api/invitations/validate/xYz123AbC...

# 3. Mike accepts invitation
POST /api/invitations/accept
{
  "token": "xYz123AbC...",
  "firstName": "Mike",
  "lastName": "Chen",
  "password": "secure123"
}
```

### Test Proposal Sharing
```bash
# 1. Admin shares proposal
POST /api/proposals/507f1f77bcf86cd799439012/share
Authorization: Bearer <admin_token>
{
  "user_ids": ["507f1f77bcf86cd799439013"]
}

# 2. User fetches proposals (should see shared one)
GET /api/proposals
Authorization: Bearer <user_token>
```

---

## Summary

**Total Files to Create**: 7 new files
**Total Files to Modify**: 4 existing files
**Database Collections**: 2 new, 2 updated
**API Endpoints**: ~15 new endpoints
**Estimated Time**: 4-6 weeks for complete implementation

**Key Benefits**:
- ⚡ Fast lookups with ObjectIds
- 🔒 Secure multi-tenant isolation
- 📧 Email invitation system
- 👥 Admin/user role hierarchy
- 🎯 Granular proposal sharing
- 🚀 Scalable architecture

**Next Steps**:
1. Review this plan
2. Set up development environment
3. Create indexes first
4. Implement CRUD classes
5. Build API endpoints
6. Test thoroughly
7. Run migration
8. Deploy to production
