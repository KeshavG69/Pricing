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


class RatePreset(BaseModel):
    """Rate preset with name and all rates"""
    id: str
    name: str
    fringe: float
    oh: float
    ga: float
    fee: float
    smh: float = 0.0
    sub_fee: float = 0.0
    ga_passthrough: float = 0.0
    escalation_rate: float = 0.0


class CreateRatePresetRequest(BaseModel):
    """Request to create a new rate preset"""
    name: str
    fringe: float
    oh: float
    ga: float
    fee: float
    smh: float = 0.0
    sub_fee: float = 0.0
    ga_passthrough: float = 0.0
    escalation_rate: float = 0.0


class UpdateRatePresetRequest(BaseModel):
    """Request to update an existing rate preset"""
    name: Optional[str] = None
    fringe: Optional[float] = None
    oh: Optional[float] = None
    ga: Optional[float] = None
    fee: Optional[float] = None
    smh: Optional[float] = None
    sub_fee: Optional[float] = None
    ga_passthrough: Optional[float] = None
    escalation_rate: Optional[float] = None


class UpdateSettingsRequest(BaseModel):
    """Request body for updating organization settings"""
    model_config = {"extra": "ignore"}

    name: Optional[str] = None
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

    # Prepare update data
    update_data = {}

    # Update organization name if provided
    if settings_update.name is not None:
        update_data["name"] = settings_update.name

    # Get existing settings
    settings = org.get("settings", {})

    # Update only provided fields in settings
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
    if update_data:
        # If name was updated, use direct update
        from auth.database import get_mongodb_client
        mongodb = get_mongodb_client()
        db = mongodb.get_database()
        db["organizations"].update_one(
            {"_id": org["_id"]},
            {"$set": update_data}
        )

    updated_org = org_crud.update_settings(current_user["organization_id"], settings)

    return serialize_doc(updated_org)


@router.post("/me/rate-presets")
async def create_rate_preset(
    preset: CreateRatePresetRequest,
    current_user: dict = Depends(require_admin)
):
    """
    Create a new rate preset (admin only).

    Args:
        preset: Rate preset data

    Returns:
        Created preset with generated ID
    """
    import uuid

    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    # Get existing settings
    settings = org.get("settings", {})
    rate_presets = settings.get("rate_presets", [])

    # Create new preset with unique ID
    new_preset = {
        "id": str(uuid.uuid4()),
        "name": preset.name,
        "fringe": preset.fringe,
        "oh": preset.oh,
        "ga": preset.ga,
        "fee": preset.fee,
        "smh": preset.smh,
        "sub_fee": preset.sub_fee,
        "ga_passthrough": preset.ga_passthrough,
        "escalation_rate": preset.escalation_rate
    }

    rate_presets.append(new_preset)
    settings["rate_presets"] = rate_presets

    # Update organization
    updated_org = org_crud.update_settings(current_user["organization_id"], settings)

    return new_preset


@router.put("/me/rate-presets/{preset_id}")
async def update_rate_preset(
    preset_id: str,
    preset_update: UpdateRatePresetRequest,
    current_user: dict = Depends(require_admin)
):
    """
    Update an existing rate preset (admin only).

    Args:
        preset_id: Preset ID to update
        preset_update: Fields to update

    Returns:
        Updated preset
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
    rate_presets = settings.get("rate_presets", [])

    # Find preset
    preset_index = None
    for i, p in enumerate(rate_presets):
        if p["id"] == preset_id:
            preset_index = i
            break

    if preset_index is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rate preset not found"
        )

    # Update preset fields
    preset = rate_presets[preset_index]
    if preset_update.name is not None:
        preset["name"] = preset_update.name
    if preset_update.fringe is not None:
        preset["fringe"] = preset_update.fringe
    if preset_update.oh is not None:
        preset["oh"] = preset_update.oh
    if preset_update.ga is not None:
        preset["ga"] = preset_update.ga
    if preset_update.fee is not None:
        preset["fee"] = preset_update.fee
    if preset_update.smh is not None:
        preset["smh"] = preset_update.smh
    if preset_update.sub_fee is not None:
        preset["sub_fee"] = preset_update.sub_fee
    if preset_update.ga_passthrough is not None:
        preset["ga_passthrough"] = preset_update.ga_passthrough
    if preset_update.escalation_rate is not None:
        preset["escalation_rate"] = preset_update.escalation_rate

    rate_presets[preset_index] = preset
    settings["rate_presets"] = rate_presets

    # Update organization
    updated_org = org_crud.update_settings(current_user["organization_id"], settings)

    return preset


@router.delete("/me/rate-presets/{preset_id}")
async def delete_rate_preset(
    preset_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Delete a rate preset (admin only).

    Args:
        preset_id: Preset ID to delete

    Returns:
        Success message
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
    rate_presets = settings.get("rate_presets", [])

    # Find and remove preset
    preset_found = False
    for i, p in enumerate(rate_presets):
        if p["id"] == preset_id:
            rate_presets.pop(i)
            preset_found = True
            break

    if not preset_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rate preset not found"
        )

    settings["rate_presets"] = rate_presets

    # Update organization
    org_crud.update_settings(current_user["organization_id"], settings)

    return {"message": "Rate preset deleted successfully", "preset_id": preset_id}



@router.post("/me/rate-presets/{preset_id}/apply-as-default")
async def apply_preset_as_default(
    preset_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Apply a rate preset as the organization's default rates (admin only).

    Copies the preset's rates to the default_rates field.

    Args:
        preset_id: Preset ID to apply

    Returns:
        Success message with updated default rates
    """
    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    settings = org.get("settings", {})
    rate_presets = settings.get("rate_presets", [])

    # Find the preset
    preset = None
    for p in rate_presets:
        if p["id"] == preset_id:
            preset = p
            break

    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rate preset not found"
        )

    # Copy preset values to default_rates
    settings["default_rates"] = {
        "fringe": preset.get("fringe", 0),
        "oh": preset.get("oh", 0),
        "ga": preset.get("ga", 0),
        "fee": preset.get("fee", 0),
        "smh": preset.get("smh", 0),
        "sub_fee": preset.get("sub_fee", 0),
        "ga_passthrough": preset.get("ga_passthrough", 0),
        "ga_adder": preset.get("ga_adder", 0),
    }

    # Also update default escalation rate if preset has it
    if preset.get("escalation_rate") is not None:
        settings["default_escalation_rate"] = preset.get("escalation_rate")

    # Update organization
    org_crud.update_settings(current_user["organization_id"], settings)

    return {
        "message": f"Preset '{preset['name']}' applied as default rates",
        "default_rates": settings["default_rates"],
        "default_escalation_rate": settings.get("default_escalation_rate")
    }


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
