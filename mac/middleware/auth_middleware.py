"""Auth dependency — extracts user from JWT or API key."""

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from mac.database import get_db
from mac.utils.security import decode_access_token
from mac.services.auth_service import get_user_by_id, get_user_by_api_key
from mac.models.user import User

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from Authorization header.
    Supports both JWT access tokens and API keys (mac_sk_live_xxx).
    """
    token = credentials.credentials

    # Check if it's an API key
    if token.startswith("mac_sk_live_"):
        user = await get_user_by_api_key(db, token)
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail={
                "code": "authentication_failed",
                "message": "Invalid or inactive API key",
            })
        return user

    # Otherwise treat as JWT
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail={
            "code": "authentication_failed",
            "message": "Invalid or expired access token",
        })

    user = await get_user_by_id(db, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail={
            "code": "authentication_failed",
            "message": "User not found or inactive",
        })

    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Require admin role."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail={
            "code": "forbidden",
            "message": "Admin access required",
        })
    return user
