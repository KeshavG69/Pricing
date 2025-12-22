"""
Organization management router.
Handles organization settings, member management, and admin operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from auth.dependencies import get_current_user, require_admin
from utils.helpers import serialize_doc, serialize_docs
from utils.organizations import get_organization_crud
from auth.crud import get_user_crud
from auth.rbac import can_manage_user


router = APIRouter(prefix="/api/organizations", tags=["organizations"])


class UpdateSettingsRequest(BaseModel):
    """Request body for updating organization settings"""
    model_config = {"extra": "ignore"}

    default_rates: Optional[Dict[str, float]] = None
    default_escalation_rate: Optional[float] = None
    allow_user_rate_override: Optional[bool] = None


@router.get("/me")
async def get_my_organization(current_user: dict = Depends(get_current_user)):
    """
    Get current user's organization details.

    Returns organization with settings, subscription info, and member count.

    Returns:
        Organization document with serialized ObjectIds
    """
    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    return serialize_doc(org)


@router.get("/me/members")
async def get_organization_members(current_user: dict = Depends(require_admin)):
    """
    List all members in the organization (admin only).

    Returns list of users with their roles and status.
    Excludes sensitive fields like passwords.

    Returns:
        List of user documents with serialized ObjectIds
    """
    org_crud = get_organization_crud()
    members = org_crud.get_members(current_user["organization_id"])

    # Remove sensitive fields
    for member in members:
        member.pop("password", None)
        member.pop("google_profile", None)

    return serialize_docs(members)


@router.patch("/me/settings")
async def update_organization_settings(
    settings_update: UpdateSettingsRequest,
    current_user: dict = Depends(require_admin)
):
    """
    Update organization settings (admin only).

    Updates default rates, escalation rates, and other configuration.
    Only updates fields that are provided (partial update).

    Args:
        settings_update: Fields to update in organization settings

    Returns:
        Updated organization document
    """
    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    # Get existing settings
    settings = org.get("settings", {})

    # Update only provided fields
    if settings_update.default_rates is not None:
        settings["default_rates"] = {
            **settings.get("default_rates", {}),
            **settings_update.default_rates
        }

    if settings_update.default_escalation_rate is not None:
        settings["default_escalation_rate"] = settings_update.default_escalation_rate

    if settings_update.allow_user_rate_override is not None:
        settings["allow_user_rate_override"] = settings_update.allow_user_rate_override

    # Update organization
    updated_org = org_crud.update_settings(current_user["organization_id"], settings)

    return serialize_doc(updated_org)


@router.delete("/members/{user_id}")
async def remove_organization_member(
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Remove a user from the organization (admin only).

    Performs soft delete by setting user status to "removed".
    Cannot remove yourself or users from other organizations.

    Args:
        user_id: User's ObjectId as string

    Returns:
        Success message

    Raises:
        HTTPException 400: If trying to remove yourself or invalid user ID
        HTTPException 403: If user not in your organization
        HTTPException 404: If user not found
    """
    # Get current user ID as string
    current_user_id = str(current_user.get("_id")) if current_user.get("_id") else current_user.get("id")

    # Cannot remove yourself
    if current_user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself from the organization"
        )

    # Get target user (try both ObjectId and string ID)
    user_crud = get_user_crud()

    # Try to find user by _id (ObjectId) or by serialized id field
    try:
        user_oid = ObjectId(user_id)
        target_user = user_crud.collection.find_one({"_id": user_oid})
    except:
        # If not a valid ObjectId, treat as string UUID
        target_user = user_crud.collection.find_one({
            "$or": [
                {"_id": user_id},
                {"id": user_id}
            ]
        })

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Verify user belongs to same organization
    if target_user.get("organization_id") != current_user["organization_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to your organization"
        )

    # Check RBAC permission
    if not can_manage_user(target_user, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to remove this user"
        )

    # Remove user from this organization (update status in organizations array)
    from datetime import datetime
    user_crud.collection.update_one(
        {
            "_id": target_user["_id"],
            "organizations.organization_id": current_user["organization_id"]
        },
        {
            "$set": {
                "organizations.$.status": "removed",
                "updatedAt": datetime.utcnow()
            }
        }
    )

    return {
        "message": "User removed successfully from organization",
        "user_id": user_id
    }


@router.get("/me/stats")
async def get_organization_stats(current_user: dict = Depends(get_current_user)):
    """
    Get organization statistics.

    Returns member count, proposal count, and subscription info.

    Returns:
        Organization statistics
    """
    from auth.database import get_mongodb_client

    org_id = current_user["organization_id"]

    # Get collections
    users_collection = get_mongodb_client().get_users_collection()
    db = get_mongodb_client().get_database()
    invitations_collection = db["invitations"]
    proposals_collection = db["proposals"]

    # Count active members (query organizations array)
    active_members = users_collection.count_documents({
        "organizations": {
            "$elemMatch": {
                "organization_id": org_id,
                "status": "active"
            }
        }
    })

    # Count pending invitations
    pending_invitations = invitations_collection.count_documents({
        "organization_id": org_id,
        "status": "pending"
    })

    # Count proposals (if using new organization-aware structure)
    total_proposals = proposals_collection.count_documents({
        "organization_id": org_id
    })

    return {
        "active_members": active_members,
        "pending_invitations": pending_invitations,
        "total_proposals": total_proposals,
        "subscription": {
            "plan": "free",  # This would come from org.subscription
            "seats_used": active_members,
            "seats_available": 5  # This would come from org.subscription
        }
    }
