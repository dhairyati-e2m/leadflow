import logging
from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.models.entities import Notification, User

logger = logging.getLogger(__name__)


async def create_and_send_notification(
    session: AsyncSession,
    recipient_id: str,
    type: str,
    title: str,
    message: str,
    org_id: Optional[str] = None,
    link: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
    send_email: bool = True,
) -> Notification:
    """
    Creates a persistent in-app notification for recipient_id.
    Optionally dispatches a transactional email notification via ResendProvider
    if enabled/mocked, without failing the database transaction if email fails.
    """
    notification = Notification(
        recipient_id=recipient_id,
        org_id=org_id,
        type=type,
        title=title,
        message=message,
        link=link,
        is_read=False,
        metadata_json=metadata_json or {},
    )
    session.add(notification)

    # Optional transactional email dispatch
    if send_email and settings.PROVIDER_RESEND_MODE in ("live", "mock"):
        try:
            user_stmt = select(User).where(User.id == recipient_id)
            user = (await session.execute(user_stmt)).scalars().first()
            if user and user.email:
                from backend.app.providers.resend import ResendProvider
                resend = ResendProvider()
                email_html = f"""
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <h2 style="color: #0f172a; margin-top: 0;">{title}</h2>
                    <p style="color: #334155; line-height: 1.6;">{message}</p>
                    {f'<p><a href="{link}" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">View Details in LeadFlow</a></p>' if link else ''}
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                    <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">LeadFlow Automated System Notification &bull; Do not reply to this email.</p>
                </div>
                """
                await resend.execute(
                    target=user.email,
                    subject=f"[LeadFlow] {title}",
                    html_content=email_html,
                    purpose="transactional_notification",
                )
        except Exception as exc:
            logger.warning("Optional transactional email dispatch failed for notification %s: %s", title, exc)

    return notification
