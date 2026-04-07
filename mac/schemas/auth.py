"""Auth request/response schemas."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Requests ──────────────────────────────────────────────

class LoginRequest(BaseModel):
    roll_number: str = Field(..., min_length=3, max_length=40, examples=["21CS045"])
    password: str = Field(..., min_length=1, max_length=128)


class SignupRequest(BaseModel):
    roll_number: str = Field(..., min_length=3, max_length=20, examples=["21CS045"])
    dob: str = Field(..., examples=["15-08-2003"], description="DD-MM-YYYY date of birth for verification")


class VerifyRequest(BaseModel):
    roll_number: str = Field(..., min_length=3, max_length=40, examples=["21CS045"])
    dob: str = Field(..., examples=["15082003"], description="DOB as DDMMYYYY")


class SetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


# ── Responses ─────────────────────────────────────────────

class UserProfile(BaseModel):
    id: Optional[str] = None
    roll_number: str
    name: str
    email: Optional[str] = None
    department: str
    role: str
    is_active: bool
    must_change_password: bool = False
    api_key: str
    created_at: datetime

    class Config:
        from_attributes = True


class QuotaInfo(BaseModel):
    daily_tokens: int
    tokens_used_today: int
    requests_per_hour: int
    requests_this_hour: int


class UserProfileWithQuota(UserProfile):
    quota: Optional[QuotaInfo] = None


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    must_change_password: bool = False
    user: UserProfile


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class MessageResponse(BaseModel):
    message: str
