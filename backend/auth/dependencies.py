"""
Authentication dependencies for FastAPI endpoints.
Provides JWT token validation and role-based access control.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from jose import jwt, JWTError
from typing import Optional
from auth import config
from auth.database import MongoDB
from auth.blacklist import is_token_blacklisted


security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Get current user from JWT token.

    Validates JWT token and returns user dict with organization info.

    Args:
        credentials: HTTP Bearer token from Authorization header

    Returns:
        User document dict with _id, email, organization_id, role, status

    Raises:
        HTTPException 401: If token is invalid, expired, or user not found
        HTTPException 403: If account is suspended
    """
    token = credentials.credentials

    try:
        # Decode JWT token
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        email: str = payload.get("sub")

        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing email"
            )

        # Check if token is blacklisted
        if is_token_blacklisted(email, token):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked"
            )

        # Get user from database
        db = MongoDB.get_database()
        users_collection = db["users"]
        user = users_collection.find_one({"email": email})

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        # Check if account is active
        if user.get("status") != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account suspended or inactive"
            )

        return user

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Require admin role for endpoint access.

    Args:
        current_user: User dict from get_current_user dependency

    Returns:
        User dict if user has admin role

    Raises:
        HTTPException 403: If user does not have admin role
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )

    return current_user


async def get_current_user_id(
    current_user: dict = Depends(get_current_user)
) -> ObjectId:
    """
    Get current user's ObjectId.

    Convenience dependency for endpoints that only need user_id.

    Args:
        current_user: User dict from get_current_user dependency

    Returns:
        User's MongoDB ObjectId
    """
    return current_user["_id"]


async def get_current_organization_id(
    current_user: dict = Depends(get_current_user)
) -> ObjectId:
    """
    Get current user's organization ObjectId.

    Convenience dependency for endpoints that only need organization_id.

    Args:
        current_user: User dict from get_current_user dependency

    Returns:
        Organization's MongoDB ObjectId

    Raises:
        HTTPException 403: If user does not belong to an organization
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to an organization"
        )

    return org_id
