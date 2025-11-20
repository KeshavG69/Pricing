"""
Authentication router for user management endpoints.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import timedelta, datetime

# Authentication imports
from auth.models import UserSignup, UserLogin, UserResponse, Token, LogoutResponse, GoogleLoginRequest
from auth.crud import UserCRUD
from auth.utils import create_access_token, verify_token, ACCESS_TOKEN_EXPIRE_MINUTES
from auth.blacklist import add_token_to_blacklist
from auth.google_auth import GoogleAuthService

router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from JWT token"""
    token = credentials.credentials
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = UserCRUD.get_user_by_email(token_data.email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
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


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    """
    Authenticate user and return access token

    Args:
        user_data: User login data including email and password

    Returns:
        Token: Access token for authenticated requests
    """
    try:
        user = UserCRUD.authenticate_user(user_data.email, user_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.email}, expires_delta=access_token_expires
        )

        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )


@router.post("/google/login", response_model=Token)
async def google_login(request: GoogleLoginRequest):
    """
    Authenticate user with Google OAuth token

    Args:
        request: GoogleLoginRequest containing the Google JWT token

    Returns:
        Token: Access token for authenticated requests
    """
    try:
        # Initialize Google Auth service
        google_auth = GoogleAuthService()

        # Verify Google token and get user profile
        google_profile = google_auth.verify_google_token(request.credential)
        if not google_profile:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token"
            )

        # Create or update user in database
        user = UserCRUD.create_or_update_google_user(google_profile)

        # Create JWT token for our system
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.email}, expires_delta=access_token_expires
        )

        return {"access_token": access_token, "token_type": "bearer"}

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


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Logout user by blacklisting the current JWT token

    Args:
        credentials: JWT token from Authorization header
        current_user: Current authenticated user (for validation)

    Returns:
        LogoutResponse: Confirmation message with timestamp
    """
    try:
        # Extract the actual token from credentials
        current_token = credentials.credentials

        # Add token to user's blacklist
        success = add_token_to_blacklist(current_user.email, current_token)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to logout user"
            )

        # Return success response
        return LogoutResponse(
            message="Successfully logged out",
            timestamp=datetime.utcnow()
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Logout failed: {str(e)}"
        )
