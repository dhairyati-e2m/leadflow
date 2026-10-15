import logging
from typing import Any, Dict, List, Literal, Optional
import httpx

from backend.app.core.config import settings
from backend.app.core.quota import QuotaManager
from backend.app.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)


class ResendProvider(BaseProvider):
    """
    Resend Transactional Email Provider.
    Free Tier: 100 emails/day, 3,000 emails/month free recurring.
    Safety Limit: 80 emails/day.
    STRICT SECURITY BOUNDARY: Reserved solely for transactional system notifications
    and J5 password reset links. Forbidden for prospect cold outreach.
    """

    BASE_URL: str = "https://api.resend.com/emails"

    def __init__(
        self,
        api_key: Optional[str] = None,
        from_email: Optional[str] = None,
        mode: Optional[Literal["mock", "live", "disabled"]] = None,
        timeout_seconds: float = 10.0,
    ):
        provider_mode = mode or settings.PROVIDER_RESEND_MODE
        super().__init__(
            key="resend",
            name="Resend Transactional Email",
            mode=provider_mode,
        )
        self.api_key = api_key or settings.RESEND_API_KEY
        self.from_email = from_email or settings.RESEND_FROM_EMAIL
        self.timeout_seconds = timeout_seconds

    async def execute(self, target: str, subject: str = "", html_content: str = "", **kwargs: Any) -> ProviderResult:
        """
        Sends a single transactional email to the target recipient.
        target: recipient email address (e.g. user@example.com).
        """
        to_email = target.strip()
        if not to_email or "@" not in to_email:
            return ProviderResult(
                provider_key=self.key,
                status="error",
                error_message="Invalid recipient email address.",
            )

        # Enforce email purpose check (security & quota safety)
        email_purpose = kwargs.get("purpose", "transactional_notification")
        allowed_purposes = [
            "password_reset",
            "transactional_notification",
            "quota_alert",
            "lead_outreach",
            "approved_outreach",
        ]
        if email_purpose not in allowed_purposes:
            logger.warning("Rejected unapproved email dispatch attempt via Resend: %s", email_purpose)
            return ProviderResult(
                provider_key=self.key,
                status="error",
                error_message="Resend is restricted to transactional security emails and human-approved lead outreach.",
            )

        if self.mode == "disabled":
            return ProviderResult(
                provider_key=self.key,
                status="disabled",
                data={"delivered": False, "to": to_email, "subject": subject},
            )

        if self.mode == "mock" or not self.api_key:
            logger.info("[MOCK RESEND] Sent email to %s: '%s'", to_email, subject)
            return ProviderResult(
                provider_key=self.key,
                status="mock",
                data={
                    "delivered": True,
                    "to": to_email,
                    "subject": subject,
                    "id": "mock_email_" + hex(hash(to_email + subject))[2:],
                    "synthetic": True,
                },
                quota_consumed=0,
            )

        # Check daily quota reservation
        allowed, reason, quota_status = await QuotaManager.check_and_reserve("resend", metric="requests", count=1)
        if not allowed:
            logger.warning("Resend quota check failed (%s). Mocking delivery.", reason)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={"delivered": False, "to": to_email, "fallback_reason": reason},
                quota_consumed=0,
                error_message=reason,
            )

        payload = {
            "from": self.from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_content or f"<p>System notification: {subject}</p>",
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(self.BASE_URL, json=payload, headers=headers)

            if resp.status_code in [200, 201]:
                res_data = resp.json()
                return ProviderResult(
                    provider_key=self.key,
                    status="success",
                    data=res_data,
                    quota_consumed=1,
                )
            else:
                await QuotaManager.release_reservation("resend", metric="requests", count=1)
                logger.error("Resend API error HTTP %d: %s", resp.status_code, resp.text)
                return ProviderResult(
                    provider_key=self.key,
                    status="fallback",
                    data={"delivered": False, "to": to_email},
                    quota_consumed=0,
                    error_message=f"Resend HTTP {resp.status_code}: {resp.text}",
                )

        except Exception as exc:
            await QuotaManager.release_reservation("resend", metric="requests", count=1)
            logger.error("Resend delivery failed: %s", exc)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={"delivered": False, "to": to_email},
                quota_consumed=0,
                error_message=str(exc),
            )

    async def send_password_reset_email(self, to_email: str, reset_link: str) -> ProviderResult:
        """Helper to send J5 password reset link."""
        subject = "Reset Your LeadFlow Password"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #6366f1;">LeadFlow Security</h2>
            <p>We received a request to reset your password. Click the button below to choose a new password.</p>
            <div style="margin: 24px 0;">
                <a href="{reset_link}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Reset Password
                </a>
            </div>
            <p style="color: #64748b; font-size: 13px;">This link will expire in 15 minutes. If you did not request this reset, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 12px;">LeadFlow Security Operations &bull; Automated System Dispatch</p>
        </div>
        """
        return await self.execute(
            target=to_email,
            subject=subject,
            html_content=html,
            purpose="password_reset",
        )

    async def send_lead_outreach_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        html_content: Optional[str] = None,
    ) -> ProviderResult:
        """Sends approved outreach email to target company lead."""
        if not html_content:
            paragraphs = "".join(f"<p>{p.strip()}</p>" for p in body_text.split("\n\n") if p.strip())
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #1e293b;">
                {paragraphs}
                <br />
                <p style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                    Sent on behalf of verified workspace strategy team via LeadFlow Outreach.
                </p>
            </div>
            """
        return await self.execute(
            target=to_email,
            subject=subject,
            html_content=html_content,
            purpose="approved_outreach",
        )

    def get_quota_info(self) -> Dict[str, Any]:
        limits = QuotaManager.get_provider_limits(self.key)
        return {
            "provider": self.key,
            "daily_limit": limits.get("daily", 80),
            "monthly_limit": limits.get("monthly", 2400),
            "from_email": self.from_email,
            "mode": self.mode,
            "is_configured": bool(self.api_key),
        }
