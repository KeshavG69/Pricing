from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserSignup(BaseModel):
    firstName: str
    lastName: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    firstName: str
    lastName: str
    email: str
    createdAt: datetime


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


class BlacklistedToken(BaseModel):
    token: str
    blacklisted_at: datetime
    expires_at: datetime


class LogoutResponse(BaseModel):
    message: str
    timestamp: datetime


class GoogleLoginRequest(BaseModel):
    credential: str


class GoogleUserProfile(BaseModel):
    sub: str
    name: str
    given_name: str
    family_name: str
    picture: str
    email: str
    email_verified: bool
