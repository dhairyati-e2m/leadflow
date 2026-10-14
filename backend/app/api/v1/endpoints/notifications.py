from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session
from backend.app.core.deps import get_current_user
from backend.app.models.entities import Notification, User

router = APIRouter()


class NotificationOut(BaseModel):
    id: str
    recipient_id: str
    org_id: Optional[str] = None
    type: str
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool
    metadata_json: Dict[str, Any]
    created_at: str


class NotificationListResponse(BaseModel):
    items: List[NotificationOut]
    unread_count: int


@router.get("", response_model=NotificationListResponse, summary="List Current User Notifications")
async def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NotificationListResponse:
    # Count unread notifications
    count_stmt = select(func.count(Notification.id)).where(
        Notification.recipient_id == user.id,
        Notification.is_read == False,
    )
    unread_count = (await session.execute(count_stmt)).scalar() or 0

    # Fetch recent notifications
    stmt = (
        select(Notification)
        .where(Notification.recipient_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    results = (await session.execute(stmt)).scalars().all()

    items = [
        NotificationOut(
            id=n.id,
            recipient_id=n.recipient_id,
            org_id=n.org_id,
            type=n.type,
            title=n.title,
            message=n.message,
            link=n.link,
            is_read=n.is_read,
            metadata_json=n.metadata_json or {},
            created_at=n.created_at.isoformat() if n.created_at else "",
        )
        for n in results
    ]

    return NotificationListResponse(items=items, unread_count=unread_count)


@router.patch("/{notification_id}/read", response_model=NotificationOut, summary="Mark Notification as Read")
async def mark_notification_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NotificationOut:
    stmt = select(Notification).where(
        Notification.id == notification_id,
        Notification.recipient_id == user.id,
    )
    notification = (await session.execute(stmt)).scalars().first()
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    notification.is_read = True
    await session.commit()
    await session.refresh(notification)

    return NotificationOut(
        id=notification.id,
        recipient_id=notification.recipient_id,
        org_id=notification.org_id,
        type=notification.type,
        title=notification.title,
        message=notification.message,
        link=notification.link,
        is_read=notification.is_read,
        metadata_json=notification.metadata_json or {},
        created_at=notification.created_at.isoformat() if notification.created_at else "",
    )


@router.post("/read-all", response_model=Dict[str, Any], summary="Mark All Notifications as Read")
async def mark_all_notifications_read(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    stmt = (
        update(Notification)
        .where(
            Notification.recipient_id == user.id,
            Notification.is_read == False,
        )
        .values(is_read=True)
    )
    res = await session.execute(stmt)
    await session.commit()

    return {"status": "success", "updated_count": res.rowcount}
