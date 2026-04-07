"""Authentication endpoints — /auth."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from mac.database import get_db
from mac.schemas.auth import (
    LoginRequest, LoginResponse, RefreshRequest, RefreshResponse,
    ChangePasswordRequest, MessageResponse, UserProfileWithQuota, QuotaInfo, UserProfile,
    SignupRequest, SetPasswordRequest, VerifyRequest,
)
from mac.services import auth_service
from mac.services.usage_service import get_tokens_used_today, get_requests_this_hour
from mac.middleware.auth_middleware import get_current_user, require_admin
from mac.models.user import User, StudentRegistry
from mac.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Unified verify (roll_number + DOB) ────────────────────

@router.post("/verify", response_model=LoginResponse)
async def verify(body: VerifyRequest, db: AsyncSession = Depends(get_db)):
    """Unified auth: verify roll_number + DOB against college registry.
    Creates account on first use; subsequent calls re-verify DOB.
    Always returns tokens. Client checks must_change_password."""
    from datetime import date as _date

    raw = body.dob.strip().replace("-", "").replace("/", "")
    if len(raw) != 8 or not raw.isdigit():
        raise HTTPException(status_code=400, detail={
            "code": "validation_error",
            "message": "DOB must be 8 digits (DDMMYYYY).",
        })
    try:
        parsed_dob = _date(int(raw[4:8]), int(raw[2:4]), int(raw[0:2]))
    except ValueError:
        raise HTTPException(status_code=400, detail={
            "code": "validation_error",
            "message": "Invalid date. Use DDMMYYYY.",
        })

    # Look up registry
    entry = await auth_service.get_registry_entry(db, body.roll_number)
    if not entry:
        raise HTTPException(status_code=401, detail={
            "code": "not_found",
            "message": "Registration number not found in college records.",
        })
    if entry.dob != parsed_dob:
        raise HTTPException(status_code=401, detail={
            "code": "dob_mismatch",
            "message": "Date of birth does not match college records.",
        })

    # Check if user already has an account
    user = await auth_service.get_user_by_roll(db, body.roll_number)
    if not user:
        # First time — create account
        user = await auth_service.create_user(
            db,
            roll_number=entry.roll_number,
            name=entry.name,
            password="__dob_temp__",  # placeholder, must_change_password=True forces reset
            department=entry.department,
            role="student",
            must_change_password=True,
        )

    access_token, refresh_token = await auth_service.create_tokens(db, user)
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        must_change_password=user.must_change_password,
        user=UserProfile.model_validate(user),
    )


# ── Legacy login (password-based, for API / admin) ────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with roll number and password."""
    user = await auth_service.authenticate_user(db, body.roll_number, body.password)
    if not user:
        raise HTTPException(status_code=401, detail={
            "code": "authentication_failed",
            "message": "Invalid roll number or password",
        })

    access_token, refresh_token = await auth_service.create_tokens(db, user)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        must_change_password=user.must_change_password,
        user=UserProfile.model_validate(user),
    )


# ── Force set password (first-time) ──────────────────────

@router.post("/set-password", response_model=MessageResponse)
async def set_password(
    body: SetPasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set password on first login. Only works when must_change_password=True."""
    if not user.must_change_password:
        raise HTTPException(status_code=400, detail={
            "code": "bad_request",
            "message": "Password already set. Use change-password instead.",
        })
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail={
            "code": "validation_error",
            "message": "Passwords do not match.",
        })
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail={
            "code": "validation_error",
            "message": "Password must be at least 8 characters.",
        })
    await auth_service.force_set_password(db, user, body.new_password)
    return MessageResponse(message="Password set successfully. You are now signed in.")


# ── Logout & Refresh ──────────────────────────────────────

@router.post("/logout", response_model=MessageResponse)
async def logout(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Logout — revoke all refresh tokens."""
    await auth_service.revoke_refresh_tokens(db, user.id)
    return MessageResponse(message="Successfully logged out")


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange refresh token for a new access token."""
    result = await auth_service.refresh_access_token(db, body.refresh_token)
    if not result:
        raise HTTPException(status_code=401, detail={
            "code": "authentication_failed",
            "message": "Invalid or expired refresh token",
        })
    access_token, user = result
    return RefreshResponse(
        access_token=access_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


# ── Profile ───────────────────────────────────────────────

@router.get("/me", response_model=UserProfileWithQuota)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get current user profile with quota status."""
    tokens_today = await get_tokens_used_today(db, user.id)
    reqs_hour = await get_requests_this_hour(db, user.id)

    profile = UserProfileWithQuota.model_validate(user)
    profile.quota = QuotaInfo(
        daily_tokens=settings.rate_limit_tokens_per_day,
        tokens_used_today=tokens_today,
        requests_per_hour=settings.rate_limit_requests_per_hour,
        requests_this_hour=reqs_hour,
    )
    return profile


@router.put("/me/profile", response_model=MessageResponse)
async def update_profile(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update own profile fields (name, email)."""
    if "name" in body:
        user.name = body["name"][:100]
    if "email" in body:
        user.email = body["email"][:200] if body["email"] else None
    await db.flush()
    return MessageResponse(message="Profile updated")


# ── Change password ───────────────────────────────────────

@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password — requires current password."""
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail={
            "code": "validation_error",
            "message": "New password must be at least 8 characters.",
        })
    success = await auth_service.change_password(db, user, body.old_password, body.new_password)
    if not success:
        raise HTTPException(status_code=401, detail={
            "code": "authentication_failed",
            "message": "Current password is incorrect",
        })
    return MessageResponse(message="Password changed successfully")


# ══════════════════════════════════════════════════════════
# ADMIN — Full Control Panel
# ══════════════════════════════════════════════════════════

@router.get("/admin/users")
async def list_users(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """List all users (admin only)."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return {
        "users": [
            {
                "id": u.id,
                "roll_number": u.roll_number,
                "name": u.name,
                "email": u.email,
                "department": u.department,
                "role": u.role,
                "is_active": u.is_active,
                "must_change_password": u.must_change_password,
                "api_key": u.api_key,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
        "total": len(users),
    }


@router.post("/admin/users")
async def create_user_admin(
    body: dict,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (admin only)."""
    roll = body.get("roll_number", "").strip()
    name = body.get("name", "").strip()
    password = body.get("password", "")
    department = body.get("department", "CSE")
    role = body.get("role", "student")
    email = body.get("email")

    if not roll or not name or not password:
        raise HTTPException(status_code=400, detail={"code": "validation_error", "message": "roll_number, name, password required"})

    existing = await auth_service.get_user_by_roll(db, roll)
    if existing:
        raise HTTPException(status_code=409, detail={"code": "conflict", "message": "Roll number already exists"})

    user = await auth_service.create_user(
        db, roll_number=roll, name=name, password=password,
        department=department, role=role, email=email,
        must_change_password=body.get("must_change_password", True),
    )
    await db.commit()
    return {"message": f"User {roll} created", "user": {"id": user.id, "roll_number": user.roll_number, "role": user.role}}


@router.put("/admin/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: dict,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Change a user's role (admin only)."""
    new_role = body.get("role", "")
    if new_role not in ("student", "faculty", "admin"):
        raise HTTPException(status_code=400, detail={"code": "validation_error", "message": "role must be student, faculty, or admin"})

    user = await auth_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found"})

    user.role = new_role
    await db.commit()
    return {"message": f"User {user.roll_number} role updated to {new_role}"}


@router.put("/admin/users/{user_id}/status")
async def toggle_user_status(
    user_id: str,
    body: dict,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Activate/deactivate a user (admin only)."""
    user = await auth_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found"})

    user.is_active = body.get("is_active", True)
    await db.commit()
    return {"message": f"User {user.roll_number} {'activated' if user.is_active else 'deactivated'}"}


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user (admin only). Cannot delete self."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail={"code": "bad_request", "message": "Cannot delete your own account"})
    user = await auth_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found"})
    await db.delete(user)
    await db.commit()
    return {"message": f"User {user.roll_number} deleted"}


@router.post("/admin/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset a user password to a temp value and flag must_change_password."""
    user = await auth_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found"})

    import secrets
    temp = secrets.token_urlsafe(8)
    await auth_service.force_set_password(db, user, temp)
    user.must_change_password = True
    await db.commit()
    return {"message": f"Password reset for {user.roll_number}", "temp_password": temp}


@router.post("/admin/users/{user_id}/regenerate-key")
async def regenerate_api_key(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate a user's API key."""
    user = await auth_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found"})

    from mac.models.user import _gen_api_key
    user.api_key = _gen_api_key()
    await db.commit()
    return {"message": f"API key regenerated for {user.roll_number}", "api_key": user.api_key}


# ── Admin: Student registry management ────────────────────

@router.get("/admin/registry")
async def list_registry(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all student registry entries."""
    result = await db.execute(select(StudentRegistry).order_by(StudentRegistry.roll_number))
    entries = result.scalars().all()
    return {
        "entries": [
            {"id": e.id, "roll_number": e.roll_number, "name": e.name,
             "department": e.department, "dob": e.dob.isoformat(), "batch_year": e.batch_year}
            for e in entries
        ],
        "total": len(entries),
    }


@router.post("/admin/registry")
async def add_registry_entry(
    body: dict,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Add a single student to the registry."""
    from datetime import date as dt_date
    roll = body.get("roll_number", "").strip()
    name = body.get("name", "").strip()
    dept = body.get("department", "CSE")
    dob_str = body.get("dob", "")  # DD-MM-YYYY
    batch = body.get("batch_year")

    if not roll or not name or not dob_str:
        raise HTTPException(status_code=400, detail={"code": "validation_error", "message": "roll_number, name, dob required"})

    try:
        parts = dob_str.strip().split("-")
        dob = dt_date(int(parts[2]), int(parts[1]), int(parts[0]))
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail={"code": "validation_error", "message": "dob must be DD-MM-YYYY"})

    existing = await auth_service.get_registry_entry(db, roll)
    if existing:
        raise HTTPException(status_code=409, detail={"code": "conflict", "message": "Roll number already in registry"})

    entry = StudentRegistry(roll_number=roll, name=name, department=dept, dob=dob, batch_year=batch)
    db.add(entry)
    await db.commit()
    return {"message": f"Registry entry for {roll} added"}


@router.post("/admin/registry/bulk")
async def bulk_add_registry(
    body: dict,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Bulk add students. body: { students: [{roll_number, name, department, dob, batch_year}] }"""
    from datetime import date as dt_date
    students = body.get("students", [])
    added = 0
    errors = []
    for s in students:
        roll = s.get("roll_number", "").strip()
        name = s.get("name", "").strip()
        dept = s.get("department", "CSE")
        dob_str = s.get("dob", "")
        batch = s.get("batch_year")
        if not roll or not name or not dob_str:
            errors.append(f"{roll}: missing fields")
            continue
        try:
            parts = dob_str.strip().split("-")
            dob = dt_date(int(parts[2]), int(parts[1]), int(parts[0]))
        except (ValueError, IndexError):
            errors.append(f"{roll}: invalid dob")
            continue
        existing = await auth_service.get_registry_entry(db, roll)
        if existing:
            errors.append(f"{roll}: already exists")
            continue
        db.add(StudentRegistry(roll_number=roll, name=name, department=dept, dob=dob, batch_year=batch))
        added += 1
    await db.commit()
    return {"message": f"{added} students added", "errors": errors}


# ── Admin: Stats overview ─────────────────────────────────

@router.get("/admin/stats")
async def admin_stats(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Dashboard stats for admin."""
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar() or 0
    admin_count = (await db.execute(select(func.count(User.id)).where(User.role == "admin"))).scalar() or 0
    registry_count = (await db.execute(select(func.count(StudentRegistry.id)))).scalar() or 0

    from mac.models.user import UsageLog
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    requests_today = (await db.execute(
        select(func.count(UsageLog.id)).where(UsageLog.created_at >= today_start)
    )).scalar() or 0
    tokens_today = (await db.execute(
        select(func.coalesce(func.sum(UsageLog.tokens_in + UsageLog.tokens_out), 0)).where(UsageLog.created_at >= today_start)
    )).scalar() or 0

    return {
        "total_users": total_users,
        "active_users": active_users,
        "admin_count": admin_count,
        "registry_count": registry_count,
        "requests_today": requests_today,
        "tokens_today": tokens_today,
    }
