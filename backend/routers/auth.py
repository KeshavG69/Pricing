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

router = APIRouter(prefix="/auth", tags=["authentication"])


def get_current_user(
    access_token: Optional[str] = Cookie(None, alias=COOKIE_ACCESS_TOKEN_NAME)
):
    """Get current user from access token cookie"""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    token_data = verify_token(access_token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

    user = UserCRUD.get_user_by_email(token_data.email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


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
        user = UserCRUD.create_user(user_data)
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
async def login(user_data: UserLogin, response: Response, request: Request):
    """
    Authenticate user and set HttpOnly cookies

    Args:
        user_data: User login data including email and password
        response: FastAPI Response object to set cookies
        request: FastAPI Request object for device info

    Returns:
        Dict with success message and user info
    """
    try:
        user = UserCRUD.authenticate_user(user_data.email, user_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )

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

        # Set cookies
        set_access_token_cookie(response, access_token)
        set_refresh_token_cookie(response, refresh_token)

        return {
            "message": "Login successful",
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
    response: Response,
    request: Request
):
    """
    Authenticate user with Google OAuth token and set HttpOnly cookies

    Args:
        google_request: GoogleLoginRequest containing the Google JWT token
        response: FastAPI Response object to set cookies
        request: FastAPI Request object for device info

    Returns:
        Dict with success message and user info
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
        user = UserCRUD.create_or_update_google_user(google_profile)

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

        # Set cookies
        set_access_token_cookie(response, access_token)
        set_refresh_token_cookie(response, refresh_token)

        return {
            "message": "Login successful",
            "user": user
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google login failed: {str(e)}"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_user)):
    """
    Get current authenticated user information

    Returns:
        UserResponse: Current user information
    """
    return current_user


@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh_token_endpoint(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None, alias=COOKIE_REFRESH_TOKEN_NAME)
):
    """
    Refresh access token using refresh token cookie.
    Implements refresh token rotation for security.

    Args:
        request: FastAPI Request object for device info
        response: FastAPI Response object to set new cookies
        refresh_token: Refresh token from cookie

    Returns:
        TokenRefreshResponse: Success message
    """
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

        # Set new cookies
        set_access_token_cookie(response, access_token)
        set_refresh_token_cookie(response, new_refresh_token)

        return TokenRefreshResponse()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Token refresh failed: {str(e)}"
        )


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    response: Response,
    current_user: UserResponse = Depends(get_current_user),
    refresh_token: Optional[str] = Cookie(None, alias=COOKIE_REFRESH_TOKEN_NAME)
):
    """
    Logout user by revoking refresh token and clearing cookies

    Args:
        response: FastAPI Response object to clear cookies
        current_user: Current authenticated user (for validation)
        refresh_token: Refresh token from cookie to revoke

    Returns:
        LogoutResponse: Confirmation message with timestamp
    """
    try:
        # Revoke refresh token if present
        if refresh_token:
            await revoke_refresh_token(refresh_token)

        # Clear cookies
        clear_auth_cookies(response)

        return LogoutResponse(
            message="Successfully logged out",
            timestamp=datetime.utcnow()
        )

    except Exception as e:
        # Clear cookies anyway
        clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Logout failed: {str(e)}"
        )
