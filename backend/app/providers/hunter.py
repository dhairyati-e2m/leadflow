import logging
from typing import Any, Dict, List, Literal, Optional
import httpx

from backend.app.core.config import settings
from backend.app.core.quota import QuotaManager
from backend.app.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)


class HunterProvider(BaseProvider):
    """
    Hunter.io Adapter for professional domain email discovery and verification.
    Free Tier: 25 domain searches + 50 email verifications/month.
    Safety Limit: 20 searches + 40 verifications/month.
    Strictly gated to explicit human contact reveal requests.
    """

    DOMAIN_SEARCH_URL: str = "https://api.hunter.io/v2/domain-search"
    EMAIL_VERIFIER_URL: str = "https://api.hunter.io/v2/email-verifier"

    def __init__(
        self,
        api_key: Optional[str] = None,
        mode: Optional[Literal["mock", "live", "disabled"]] = None,
        timeout_seconds: float = 10.0,
    ):
        provider_mode = mode or settings.PROVIDER_HUNTER_MODE
        super().__init__(
            key="hunter",
            name="Hunter.io Email Discovery & Verification",
            mode=provider_mode,
        )
        self.api_key = api_key or settings.HUNTER_API_KEY
        self.timeout_seconds = timeout_seconds

    async def execute(self, target: str, action: str = "domain_search", **kwargs: Any) -> ProviderResult:
        """
        Execute domain search or email verification.
        target: domain name (e.g. acme.com) for domain_search, or email address for verify_email.
        action: 'domain_search' | 'verify_email'
        """
        clean_target = target.strip().lower()
        if not clean_target:
            return ProviderResult(
                provider_key=self.key,
                status="error",
                error_message="Target domain or email cannot be empty.",
            )

        if self.mode == "disabled":
            return ProviderResult(
                provider_key=self.key,
                status="disabled",
                data=self._get_mock_data(clean_target, action),
            )

        if self.mode == "mock" or not self.api_key:
            return ProviderResult(
                provider_key=self.key,
                status="mock",
                data=self._get_mock_data(clean_target, action),
                quota_consumed=0,
            )

        metric_name = "hunter_verify" if action == "verify_email" else "hunter"
        allowed, reason, quota_status = await QuotaManager.check_and_reserve(metric_name, metric="requests", count=1)
        if not allowed:
            logger.warning("Hunter quota blocked (%s). Returning synthetic fallback.", reason)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data=self._get_mock_data(clean_target, action),
                quota_consumed=0,
                error_message=reason,
            )

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                if action == "verify_email":
                    resp = await client.get(
                        self.EMAIL_VERIFIER_URL,
                        params={"email": clean_target, "api_key": self.api_key},
                    )
                else:
                    resp = await client.get(
                        self.DOMAIN_SEARCH_URL,
                        params={"domain": clean_target, "limit": 5, "api_key": self.api_key},
                    )

            if resp.status_code == 200:
                payload = resp.json().get("data", {})
                return ProviderResult(
                    provider_key=self.key,
                    status="success",
                    data=payload,
                    quota_consumed=1,
                )
            else:
                await QuotaManager.release_reservation(metric_name, metric="requests", count=1)
                logger.error("Hunter API HTTP %d error: %s", resp.status_code, resp.text)
                return ProviderResult(
                    provider_key=self.key,
                    status="fallback",
                    data=self._get_mock_data(clean_target, action),
                    quota_consumed=0,
                    error_message=f"Hunter API returned HTTP {resp.status_code}",
                )

        except Exception as exc:
            await QuotaManager.release_reservation(metric_name, metric="requests", count=1)
            logger.error("Hunter API request failed: %s", exc)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data=self._get_mock_data(clean_target, action),
                quota_consumed=0,
                error_message=str(exc),
            )

    def _get_mock_data(self, target: str, action: str) -> Dict[str, Any]:
        if action == "verify_email":
            return {
                "email": target,
                "status": "valid",
                "result": "deliverable",
                "score": 96,
                "domain": target.split("@")[-1] if "@" in target else "example.com",
                "synthetic": True,
            }
        else:
            domain = target.replace("https://", "").replace("http://", "").split("/")[0]
            clean_name = domain.split(".")[0]
            return {
                "domain": domain,
                "organization": clean_name.title(),
                "pattern": "{first}.{last}@" + domain,
                "emails": [
                    {
                        "value": f"contact@{domain}",
                        "type": "generic",
                        "confidence": 92,
                        "first_name": None,
                        "last_name": None,
                        "position": "General Inquiries",
                    },
                    {
                        "value": f"alex.morgan@{domain}",
                        "type": "personal",
                        "confidence": 88,
                        "first_name": "Alex",
                        "last_name": "Morgan",
                        "position": "VP Engineering",
                    },
                ],
                "synthetic": True,
            }

    def get_quota_info(self) -> Dict[str, Any]:
        search_limits = QuotaManager.get_provider_limits("hunter")
        verify_limits = QuotaManager.get_provider_limits("hunter_verify")
        return {
            "provider": self.key,
            "search_monthly_limit": search_limits.get("monthly", 20),
            "verify_monthly_limit": verify_limits.get("monthly", 40),
            "mode": self.mode,
            "is_configured": bool(self.api_key),
        }
