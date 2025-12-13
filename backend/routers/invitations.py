"""
Invitation management router.
Handles email invitations with token hashing for organization members.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field
from typing import List
from auth.dependencies import get_current_user, require_admin
from utils.helpers import serialize_doc, serialize_docs
from utils.invitations import get_invitation_crud
from auth.crud import get_user_crud
from auth.utils import create_access_token
from auth.refresh_token import create_refresh_token
from datetime import timedelta


router = APIRouter(prefix="/api/invitations", tags=["invitations"])


class InviteUserRequest(BaseModel):
    """Request body for sending invitation"""
    email: EmailStr = Field(..., description="Email address to invite")
    role: str = Field(..., description="Role for new user (admin or user)")

    class Config:
        schema_extra = {
            "example": {
                "email": "colleague@example.com",
                "role": "user"
            }
        }


class AcceptInvitationRequest(BaseModel):
    """Request body for accepting invitation"""
    token: str = Field(..., description="Invitation token from email")
    firstName: str = Field(..., min_length=1, max_length=100)
    lastName: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=100)

    class Config:
        schema_extra = {
            "example": {
                "token": "abc123...",
                "firstName": "John",
                "lastName": "Doe",
                "password": "SecurePassword123!"
            }
        }


@router.post("")
async def send_invitation(
    invite_data: InviteUserRequest,
    current_user: dict = Depends(require_admin)
):
    """
    Send an invitation to join the organization (admin only).

    Creates invitation with hashed token and sends email.
    Invitation expires in 7 days.

    Args:
        invite_data: Email and role for new user

    Returns:
        Created invitation document (without plain token)

    Raises:
        HTTPException 400: If user already exists or has pending invitation
        HTTPException 403: If not admin
    """
    # Validate role
    if invite_data.role not in ["admin", "user"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'admin' or 'user'"
        )

    invitation_crud = get_invitation_crud()

    try:
        invitation = invitation_crud.create_invitation(
            org_id=current_user["organization_id"],
            email=invite_data.email,
            role=invite_data.role,
            invited_by=current_user["_id"]
        )

        # Remove token_hash from response (security)
        invitation_response = serialize_doc(invitation)
        invitation_response.pop("token_hash", None)

        return {
            "message": "Invitation sent successfully",
            "invitation": invitation_response
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send invitation: {str(e)}"
        )


@router.get("")
async def list_pending_invitations(current_user: dict = Depends(require_admin)):
    """
    Get all pending invitations for the organization (admin only).

    Returns list of invitations sorted by creation date (newest first).
    Excludes token hashes for security.

    Returns:
        List of pending invitation documents
    """
    invitation_crud = get_invitation_crud()
    invitations = invitation_crud.get_pending(current_user["organization_id"])

    # Remove token_hash from all invitations
    for invitation in invitations:
        invitation.pop("token_hash", None)

    return serialize_docs(invitations)


@router.delete("/{invitation_id}")
async def revoke_invitation(
    invitation_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Revoke/cancel a pending invitation (admin only).

    Args:
        invitation_id: Invitation's ObjectId as string

    Returns:
        Success message

    Raises:
        HTTPException 400: If invalid invitation ID
        HTTPException 404: If invitation not found or already accepted
    """
    # Validate ObjectId
    try:
        inv_oid = ObjectId(invitation_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invitation ID format"
        )

    invitation_crud = get_invitation_crud()
    success = invitation_crud.revoke_invitation(inv_oid, current_user["organization_id"])

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found or already processed"
        )

    return {
        "message": "Invitation revoked successfully",
        "invitation_id": invitation_id
    }


@router.get("/validate/{token}")
async def validate_invitation_token(token: str):
    """
    Validate invitation token (public endpoint).

    Checks if token is valid, not expired, and not already used.
    Does not require authentication.

    Args:
        token: Invitation token from email URL

    Returns:
        Invitation details (email, organization name, role, inviter)

    Raises:
        HTTPException 400: If token is invalid, expired, or already used
    """
    invitation_crud = get_invitation_crud()

    try:
        invitation = invitation_crud.validate_token(token)

        # Return safe invitation details (no token_hash, no ObjectIds)
        return {
            "email": invitation["email"],
            "organization_name": invitation["organization_name"],
            "role": invitation["role"],
            "invited_by_name": invitation["invited_by_name"],
            "expires_at": invitation["expires_at"].isoformat(),
            "created_at": invitation["created_at"].isoformat()
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/accept")
async def accept_invitation(accept_data: AcceptInvitationRequest):
    """
    Accept invitation and create user account (public endpoint).

    Validates token, creates user with organization and role,
    marks invitation as accepted, and returns auth tokens.

    Args:
        accept_data: Token, name, and password for new user

    Returns:
        User document and authentication tokens

    Raises:
        HTTPException 400: If token invalid or user creation fails
    """
    invitation_crud = get_invitation_crud()
    user_crud = get_user_crud()

    try:
        # Validate token
        invitation = invitation_crud.validate_token(accept_data.token)

        # Create user with organization
        user = user_crud.create_user_with_organization(
            email=invitation["email"],
            first_name=accept_data.firstName,
            last_name=accept_data.lastName,
            password=accept_data.password,
            organization_id=invitation["organization_id"],
            role=invitation["role"]
        )

        # Mark invitation as accepted
        invitation_crud.accept_invitation(accept_data.token, user["_id"])

        # Generate authentication tokens
        access_token = create_access_token(
            data={"sub": user["email"]},
            expires_delta=timedelta(minutes=30)
        )

        refresh_token = await create_refresh_token(
            user_email=user["email"],
            device_info="Invitation acceptance",
            ip_address="Unknown"
        )

        # Remove sensitive fields from user response
        user_response = serialize_doc(user)
        user_response.pop("password", None)

        return {
            "message": "Invitation accepted successfully",
            "user": user_response,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to accept invitation: {str(e)}"
        )
