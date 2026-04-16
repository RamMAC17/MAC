"""Attendance router — face registration, session management, attendance marking."""

from datetime import date, datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from mac.database import get_db
from mac.middleware.auth_middleware import get_current_user, require_admin
from mac.models.user import User
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


def _check_attendance_hours():
    """Attendance sessions: create & mark only between 12:00 AM and 12:00 PM IST."""
    now_ist = datetime.now(IST)
    if now_ist.hour >= 12:
        raise HTTPException(
            status_code=400,
            detail="Attendance window closed. Sessions are active only before 12:00 PM (noon) IST.",
        )


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
    _check_attendance_hours()
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
    per_page: int = Query(20, ge=1, le=100),
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
    _check_attendance_hours()
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
    """Get full attendance report for a session with student details."""
    report = await attendance_service.get_session_report(db, session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Session not found")
    return report


@router.get("/summary")
async def attendance_summary(
    department: Optional[str] = None,
    user: User = Depends(_require_faculty_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get attendance summary per student across all sessions."""
    summaries = await attendance_service.get_student_summary(db, department=department)
    return {"students": summaries, "total": len(summaries)}
