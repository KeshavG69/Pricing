"""
Terms and Conditions router for PriceIQ.
Provides authenticated acceptance tracking.
Version and content are served from frontend for optimal performance.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
from auth.dependencies import get_current_user
from auth.database import get_mongodb_client
from auth import config

router = APIRouter(prefix="/api/terms", tags=["terms"])


@router.post("/accept")
async def accept_terms(current_user: dict = Depends(get_current_user)):
    """
    Accept current terms version.

    Requires authentication.
    Updates user document with current version + timestamp.

    Args:
        current_user: Authenticated user from JWT token

    Returns:
        dict: {"success": true, "version": "1.0.0", "accepted_at": "2025-01-01T10:30:00.000Z"}
    """
    users_collection = get_mongodb_client().get_users_collection()

    # Update user document
    result = users_collection.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "terms_accepted_version": config.CURRENT_TERMS_VERSION,
                "terms_accepted_at": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update terms acceptance"
        )

    return {
        "success": True,
        "version": config.CURRENT_TERMS_VERSION,
        "accepted_at": datetime.utcnow().isoformat()
    }


@router.get("/my-status")
async def get_my_status(current_user: dict = Depends(get_current_user)):
    """
    Get current user's terms acceptance status.

    Requires authentication.

    Args:
        current_user: Authenticated user from JWT token

    Returns:
        dict: {
            "accepted_version": "1.0.0",
            "accepted_at": "2025-01-01T10:30:00Z",
            "current_version": "1.0.0",
            "needs_acceptance": false
        }
    """
    user_version = current_user.get("terms_accepted_version")
    accepted_at = current_user.get("terms_accepted_at")
    needs_acceptance = user_version != config.CURRENT_TERMS_VERSION

    return {
        "accepted_version": user_version,
        "accepted_at": accepted_at.isoformat() if accepted_at else None,
        "current_version": config.CURRENT_TERMS_VERSION,
        "needs_acceptance": needs_acceptance
    }
