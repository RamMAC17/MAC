"""Notifications router — in-app notifications, push subscriptions, audit logs."""

import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from mac.database import get_db
from mac.middleware.auth_middleware import get_current_user, require_admin
from mac.models.user import User
from mac.schemas.notifications import (
    NotificationResponse, NotificationListResponse,
    PushSubscribeRequest,
    AuditLogResponse, AuditLogListResponse,
)
from mac.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── User Notifications ───────────────────────────────────

@router.get("", response_model=NotificationListResponse)
async def get_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's notifications."""
    notifs, total, unread = await notification_service.get_notifications(
        db, user.id, page=page, per_page=per_page,
    )
    return NotificationListResponse(
        notifications=[
            NotificationResponse(
                id=n.id, title=n.title, body=n.body, category=n.category,
                link=n.link, is_read=n.is_read, created_at=n.created_at,
            )
            for n in notifs
        ],
        total=total,
        unread_count=unread,
    )


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success = await notification_service.mark_as_read(db, notification_id, user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "read"}


@router.post("/read-all")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await notification_service.mark_all_read(db, user.id)
    return {"marked": count}


# ── Push Subscriptions ───────────────────────────────────

@router.post("/push/subscribe")
async def subscribe_push(
    req: PushSubscribeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register a Web Push subscription for browser notifications."""
    await notification_service.save_push_subscription(
        db, user.id, req.endpoint, req.p256dh_key, req.auth_key,
    )
    return {"status": "subscribed"}


@router.get("/vapid-key")
async def get_vapid_key(user: User = Depends(get_current_user)):
    """Return the VAPID public key for Web Push subscription."""
    public_key = os.getenv("VAPID_PUBLIC_KEY", "")
    if not public_key:
        raise HTTPException(status_code=501, detail="Push notifications not configured")
    return {"public_key": public_key}


# ── Audit Logs (Admin only) ─────────────────────────────

@router.get("/audit-logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: browse audit trail with filters."""
    logs, total = await notification_service.get_audit_logs(
        db, action=action, resource_type=resource_type,
        actor_id=actor_id, page=page, per_page=per_page,
    )
    return AuditLogListResponse(
        logs=[
            AuditLogResponse(
                id=l.id, actor_id=l.actor_id, actor_role=l.actor_role,
                action=l.action, resource_type=l.resource_type,
                resource_id=l.resource_id, details=l.details,
                ip_address=l.ip_address, created_at=l.created_at,
            )
            for l in logs
        ],
        total=total,
        page=page,
        per_page=per_page,
    )
