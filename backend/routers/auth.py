"""
Authentication router for user management endpoints.
Cookie-based authentication with refresh token rotation.
"""

from fastapi import APIRouter, HTTPException, Depends, status, Response, Request, Cookie
from datetime import timedelta, datetime
from typing import Optional

# Authentication imports
from auth.models import UserSignup, UserLogin, UserResponse, LogoutResponse, GoogleLoginRequest, TokenRefreshResponse
from auth.crud import UserCRUD
from auth.utils import create_access_token, verify_token, ACCESS_TOKEN_EXPIRE_MINUTES
from auth.cookies import (
    set_access_token_cookie,
    set_refresh_token_cookie,
    clear_auth_cookies,
    COOKIE_ACCESS_TOKEN_NAME,
    COOKIE_REFRESH_TOKEN_NAME
)
from auth.refresh_token import (
    create_refresh_token,
    validate_refresh_token,
    rotate_refresh_token,
    revoke_refresh_token
)
from auth.google_auth import GoogleAuthService
from auth.dependencies import get_current_user as get_current_user_from_deps

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/signup", response_model=UserResponse)
async def signup(user_data: UserSignup):
    """
    Register a new user

    Args:
        user_data: User signup data including firstName, lastName, email, password

    Returns:
        UserResponse: Created user information
    """
    try:
        user = await UserCRUD.create_user(user_data)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}"
        )


@router.post("/login")
async def login(user_data: UserLogin, request: Request):
    """
    Authenticate user and return JWT tokens in response body

    Args:
        user_data: User login data including email and password
        request: FastAPI Request object for device info

    Returns:
        Dict with tokens and user info
    """
    try:
        user = await UserCRUD.authenticate_user(user_data.email, user_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )

        # Get full user document to extract organization info
        from auth.database import MongoDB
        users_collection = await MongoDB.get_users_collection()
        user_doc = await users_collection.find_one({"email": user_data.email})

        # Extract role and organization from organizations array
        current_org_id = user_doc.get("current_organization_id")
        organizations = user_doc.get("organizations", [])

        if organizations and current_org_id:
            current_org = next(
                (org for org in organizations if org["organization_id"] == current_org_id),
                None
            )
            if current_org:
                user.organization_id = str(current_org["organization_id"])
                user.role = current_org["role"]
                user.status = current_org["status"]

        # Create access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.email}, expires_delta=access_token_expires
        )

        # Create refresh token and store in MongoDB
        device_info = request.headers.get("User-Agent", "Unknown")
        ip_address = request.client.host if request.client else "Unknown"

        refresh_token = await create_refresh_token(
            user_email=user.email,
            device_info=device_info,
            ip_address=ip_address
        )

        # Return tokens in response body (not cookies)
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": user
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )


@router.post("/google/login")
async def google_login(
    google_request: GoogleLoginRequest,
    request: Request
):
    """
    Authenticate user with Google OAuth token and return JWT tokens

    Args:
        google_request: GoogleLoginRequest containing the Google JWT token
        request: FastAPI Request object for device info

    Returns:
        Dict with tokens and user info
    """
    try:
        # Initialize Google Auth service
        google_auth = GoogleAuthService()

        # Verify Google token and get user profile
        google_profile = google_auth.verify_google_token(google_request.credential)
        if not google_profile:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token"
            )

        # Create or update user in database
        user = await UserCRUD.create_or_update_google_user(google_profile)

        # Get full user document to extract organization info
        from auth.database import MongoDB
        users_collection = await MongoDB.get_users_collection()
        user_doc = await users_collection.find_one({"email": user.email})

        # Extract role and organization from organizations array
        current_org_id = user_doc.get("current_organization_id")
        organizations = user_doc.get("organizations", [])

        if organizations and current_org_id:
            current_org = next(
                (org for org in organizations if org["organization_id"] == current_org_id),
                None
            )
            if current_org:
                user.organization_id = str(current_org["organization_id"])
                user.role = current_org["role"]
                user.status = current_org["status"]

        # Create access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.email}, expires_delta=access_token_expires
        )

        # Create refresh token and store in MongoDB
        device_info = request.headers.get("User-Agent", "Unknown")
        ip_address = request.client.host if request.client else "Unknown"

        refresh_token = await create_refresh_token(
            user_email=user.email,
            device_info=device_info,
            ip_address=ip_address
        )

        # Return tokens in response body
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": user
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google login failed: {str(e)}"
        )


@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user_from_deps)):
    """
    Get current authenticated user information

    Returns:
        User information with current organization role
    """
    # Return user info with organization-specific fields
    return {
        "id": str(current_user["_id"]),
        "email": current_user["email"],
        "firstName": current_user["firstName"],
        "lastName": current_user["lastName"],
        "organization_id": str(current_user.get("organization_id")) if current_user.get("organization_id") else None,
        "role": current_user.get("role"),
        "status": current_user.get("status"),
        "created_at": current_user["createdAt"].isoformat() if current_user.get("createdAt") else None
    }


@router.post("/refresh")
async def refresh_token_endpoint(
    request: Request,
    response: Response
):
    """
    Refresh access token using refresh token from request body.
    Implements refresh token rotation for security.

    Args:
        request: FastAPI Request object for device info and refresh token

    Returns:
        Dict with new tokens
    """
    # Get refresh token from request body
    body = await request.json()
    refresh_token = body.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found"
        )

    try:
        # Validate refresh token
        validation_result = await validate_refresh_token(refresh_token)

        if not validation_result.valid:
            # If token was reused (potential theft), revoke entire family
            if validation_result.reason == "token_reused":
                from auth.refresh_token import revoke_refresh_token_family
                await revoke_refresh_token_family(validation_result.token_family_id)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token reuse detected. All sessions invalidated."
                )

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=validation_result.reason or "Invalid refresh token"
            )

        # Create new access token
        access_token = create_access_token(
            data={"sub": validation_result.user_email},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        # Rotate refresh token (invalidate old, create new)
        device_info = request.headers.get("User-Agent", "Unknown")
        ip_address = request.client.host if request.client else "Unknown"

        new_refresh_token = await rotate_refresh_token(
            old_token=refresh_token,
            token_family_id=validation_result.token_family_id,
            device_info=device_info,
            ip_address=ip_address
        )

        # Return new tokens in response body
        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Token refresh failed: {str(e)}"
        )


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    current_user: dict = Depends(get_current_user_from_deps)
):
    """
    Logout user by revoking refresh token

    Args:
        request: FastAPI Request object with refresh token in body
        current_user: Current authenticated user (for validation)

    Returns:
        LogoutResponse: Confirmation message with timestamp
    """
    try:
        # Get refresh token from request body
        body = await request.json()
        refresh_token = body.get("refresh_token")

        # Revoke refresh token if present
        if refresh_token:
            await revoke_refresh_token(refresh_token)

        return LogoutResponse(
            message="Successfully logged out",
            timestamp=datetime.utcnow()
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Logout failed: {str(e)}"
        )
