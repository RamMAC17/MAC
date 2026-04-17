"""Attendance router — face registration, session management, attendance marking."""

from datetime import date, datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from mac.database import get_db
from mac.middleware.auth_middleware import get_current_user, require_admin
from mac.models.user import User
from mac.models.attendance import AttendanceSettings
from mac.schemas.attendance import (
    CreateAttendanceSessionRequest, AttendanceSessionResponse,
    MarkAttendanceRequest, AttendanceRecordResponse,
    RegisterFaceRequest, RegisterFaceResponse,
)
from mac.services import attendance_service, notification_service

router = APIRouter(prefix="/attendance", tags=["attendance"])

# IST timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))


def _require_faculty_or_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("faculty", "admin"):
        raise HTTPException(status_code=403, detail="Faculty or admin access required")
    return user


async def _get_settings(db: AsyncSession) -> AttendanceSettings:
    """Fetch singleton attendance window settings, creating defaults if missing."""
    result = await db.execute(select(AttendanceSettings).where(AttendanceSettings.id == "default"))
    cfg = result.scalar_one_or_none()
    if cfg is None:
        cfg = AttendanceSettings(id="default")
        db.add(cfg)
        await db.flush()
    return cfg


async def _check_attendance_window(db: AsyncSession):
    """Allow actions only within the configured daily window. Dev mode always open."""
    from mac.config import settings
    if settings.is_dev:
        return
    cfg = await _get_settings(db)
    now = datetime.now(IST)
    now_minutes = now.hour * 60 + now.minute
    open_minutes = cfg.open_hour * 60 + cfg.open_minute
    close_minutes = cfg.close_hour * 60 + cfg.close_minute
    if not (open_minutes <= now_minutes < close_minutes):
        raise HTTPException(
            status_code=400,
            detail=f"Attendance window closed. Active {cfg.open_hour:02d}:{cfg.open_minute:02d}–{cfg.close_hour:02d}:{cfg.close_minute:02d} IST.",
        )


# ── Attendance Window Settings ────────────────────────────────────

@router.get("/settings")
async def get_attendance_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current attendance window settings."""
    cfg = await _get_settings(db)
    now = datetime.now(IST)
    now_minutes = now.hour * 60 + now.minute
    open_minutes = cfg.open_hour * 60 + cfg.open_minute
    close_minutes = cfg.close_hour * 60 + cfg.close_minute
    return {
        "open_hour": cfg.open_hour,
        "open_minute": cfg.open_minute,
        "close_hour": cfg.close_hour,
        "close_minute": cfg.close_minute,
        "window_open_now": open_minutes <= now_minutes < close_minutes,
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


@router.put("/settings")
async def update_attendance_settings(
    body: dict,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: update attendance window open/close times (IST)."""
    cfg = await _get_settings(db)
    if "open_hour" in body:
        cfg.open_hour = int(body["open_hour"])
    if "open_minute" in body:
        cfg.open_minute = int(body["open_minute"])
    if "close_hour" in body:
        cfg.close_hour = int(body["close_hour"])
    if "close_minute" in body:
        cfg.close_minute = int(body["close_minute"])
    cfg.updated_by = user.id
    cfg.updated_at = datetime.now(timezone.utc)
    await notification_service.log_audit(
        db, action="attendance.settings_update", resource_type="attendance_settings",
        actor_id=user.id, actor_role=user.role,
        details=f"Window: {cfg.open_hour:02d}:{cfg.open_minute:02d}–{cfg.close_hour:02d}:{cfg.close_minute:02d}",
    )
    now = datetime.now(IST)
    now_minutes = now.hour * 60 + now.minute
    return {
        "open_hour": cfg.open_hour, "open_minute": cfg.open_minute,
        "close_hour": cfg.close_hour, "close_minute": cfg.close_minute,
        "window_open_now": (cfg.open_hour * 60 + cfg.open_minute) <= now_minutes < (cfg.close_hour * 60 + cfg.close_minute),
        "updated_at": cfg.updated_at.isoformat(),
    }


# Default subjects
DEFAULT_SUBJECTS = ["AI", "CSE", "IT"]


@router.get("/subjects")
async def list_subjects():
    """Return available subjects for attendance sessions."""
    return {"subjects": DEFAULT_SUBJECTS}


# ── Face Registration ─────────────────────────────────────

@router.post("/register-face", response_model=RegisterFaceResponse)
async def register_face(
    req: RegisterFaceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register face for attendance verification. Required before marking attendance."""
    result = await attendance_service.register_face(db, user.id, req.face_image_base64)
    if result["success"]:
        await notification_service.log_audit(
            db, action="attendance.face_register", resource_type="face_template",
            actor_id=user.id, actor_role=user.role,
        )
    return RegisterFaceResponse(success=result["success"], message=result["message"])


@router.get("/face-status")
async def face_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if current user has a registered face template."""
    template = await attendance_service.get_face_template(db, user.id)
    return {
        "registered": template is not None,
        "captured_at": template.captured_at.isoformat() if template else None,
    }


# ── Session Management (Faculty/Admin) ───────────────────

@router.post("/sessions", response_model=AttendanceSessionResponse)
async def create_session(
    req: CreateAttendanceSessionRequest,
    user: User = Depends(_require_faculty_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new attendance session for a department/subject."""
    await _check_attendance_window(db)
    session = await attendance_service.create_session(
        db, title=req.title, department=req.department,
        opened_by=user.id, session_date=req.session_date,
        subject=req.subject,
    )
    await notification_service.log_audit(
        db, action="attendance.session_create", resource_type="attendance_session",
        resource_id=session.id, actor_id=user.id, actor_role=user.role,
        details=f"Dept: {req.department}, Date: {req.session_date}",
    )
    return AttendanceSessionResponse(
        id=session.id, title=session.title, department=session.department,
        subject=session.subject, session_date=session.session_date,
        is_open=session.is_open, opened_by=session.opened_by,
        opened_at=session.opened_at, closed_at=session.closed_at,
    )


@router.post("/sessions/{session_id}/close")
async def close_session(
    session_id: str,
    user: User = Depends(_require_faculty_or_admin),
    db: AsyncSession = Depends(get_db),
):
    success = await attendance_service.close_session(db, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "closed"}


@router.get("/sessions")
async def list_sessions(
    department: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List attendance sessions. Students see their department only."""
    if user.role == "student":
        department = user.department
    sessions, total = await attendance_service.list_sessions(
        db, department=department, date_from=date_from, date_to=date_to,
        page=page, per_page=per_page,
    )
    return {
        "sessions": [
            {
                "id": s.id, "title": s.title, "department": s.department,
                "subject": s.subject, "session_date": s.session_date.isoformat(),
                "is_open": s.is_open, "opened_by": s.opened_by,
                "opened_at": s.opened_at.isoformat(),
                "closed_at": s.closed_at.isoformat() if s.closed_at else None,
            }
            for s in sessions
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ── Mark Attendance (Students) ───────────────────────────

@router.post("/mark")
async def mark_attendance(
    req: MarkAttendanceRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark attendance for a session with live face verification."""
    await _check_attendance_window(db)
    ip = request.client.host if request.client else None
    result = await attendance_service.mark_attendance(
        db, session_id=req.session_id, user_id=user.id,
        face_image_b64=req.face_image_base64, ip_address=ip,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    await notification_service.log_audit(
        db, action="attendance.mark", resource_type="attendance_record",
        resource_id=result.get("record_id"), actor_id=user.id, actor_role=user.role,
        ip_address=ip,
    )
    return result


# ── Reports (Faculty/Admin) ─────────────────────────────

@router.get("/sessions/{session_id}/report")
async def session_report(
    session_id: str,
    user: User = Depends(_require_faculty_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Full attendance report for a session with student details."""
    report = await attendance_service.get_session_report(db, session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Session not found")
    return report


@router.get("/admin/overview")
async def admin_overview(
    department: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    user: User = Depends(_require_faculty_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin/Faculty: all sessions enriched with opener name, record count, student list."""
    return await attendance_service.get_admin_overview(
        db, department=department, date_from=date_from, date_to=date_to,
        page=page, per_page=per_page,
    )


@router.get("/summary")
async def attendance_summary(
    department: Optional[str] = None,
    user: User = Depends(_require_faculty_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Per-student attendance summary across all sessions."""
    summaries = await attendance_service.get_student_summary(db, department=department)
    return {"students": summaries, "total": len(summaries)}
