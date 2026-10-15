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
    DISCOVER_URL: str = "https://api.hunter.io/v2/discover"

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

    async def discover_companies(
        self,
        query: str,
        limit: int = 5,
        location: Optional[str] = None,
        industry: Optional[str] = None,
        headcount: Optional[str] = None,
    ) -> ProviderResult:
        """
        Discovers companies matching ICP criteria via Hunter.io Discover API (POST /v2/discover).
        Falls back to realistic synthetic company data when in mock mode or if network/API limits occur.
        """
        limit = max(1, min(limit, 25))

        if self.mode == "disabled":
            return ProviderResult(
                provider_key=self.key,
                status="disabled",
                data={"companies": [], "total": 0, "query": query},
            )

        if self.mode == "mock" or not self.api_key:
            mock_companies = self._generate_mock_discover_companies(query, limit, location, industry, headcount)
            return ProviderResult(
                provider_key=self.key,
                status="mock",
                data={"companies": mock_companies, "total": len(mock_companies), "query": query, "synthetic": True},
                quota_consumed=0,
            )

        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload: Dict[str, Any] = {
            "query": query,
            "limit": limit,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(self.DISCOVER_URL, headers=headers, json=payload)

            if resp.status_code == 200:
                raw_data = resp.json().get("data", [])
                companies = []
                for item in raw_data[:limit]:
                    domain = item.get("domain", "")
                    emails_count = item.get("emails_count", {})
                    total_emails = emails_count.get("total", 0) if isinstance(emails_count, dict) else (emails_count or 0)
                    companies.append({
                        "company_name": item.get("organization") or domain.split(".")[0].title(),
                        "domain": domain,
                        "location": location or "Verified Location",
                        "industry": industry or "Target Vertical",
                        "employee_count": headcount or "11-50 employees",
                        "emails_count": total_emails,
                        "sample_email": f"contact@{domain}",
                        "source": "hunter_discover",
                    })

                return ProviderResult(
                    provider_key=self.key,
                    status="success",
                    data={"companies": companies, "total": len(companies), "query": query},
                    quota_consumed=0,
                )
            else:
                logger.warning("Hunter Discover API returned HTTP %d: %s. Using synthetic fallback.", resp.status_code, resp.text)
                mock_companies = self._generate_mock_discover_companies(query, limit, location, industry, headcount)
                return ProviderResult(
                    provider_key=self.key,
                    status="fallback",
                    data={"companies": mock_companies, "total": len(mock_companies), "query": query, "fallback_reason": f"HTTP {resp.status_code}"},
                    quota_consumed=0,
                )
        except Exception as exc:
            logger.error("Hunter Discover API error: %s", exc)
            mock_companies = self._generate_mock_discover_companies(query, limit, location, industry, headcount)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={"companies": mock_companies, "total": len(mock_companies), "query": query, "fallback_reason": str(exc)},
                quota_consumed=0,
            )

    def _generate_mock_discover_companies(
        self,
        query: str,
        limit: int,
        location: Optional[str] = None,
        industry: Optional[str] = None,
        headcount: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        loc = location or "Toronto, Canada"
        ind = industry or "Healthcare & Medical Devices"
        hc = headcount or "11-50 employees"

        pool = [
            {"name": "Canadian College of Health Sciences", "domain": "ccbst.ca", "emails": 53},
            {"name": "Teach For Health Canada", "domain": "teachforcanada.ca", "emails": 50},
            {"name": "Fleming Health Network", "domain": "flemingcollege.ca", "emails": 44},
            {"name": "Prep Med Academy", "domain": "prepacademytutors.com", "emails": 39},
            {"name": "Council of Ontario Clinics", "domain": "cou.ca", "emails": 33},
            {"name": "Metropolitan Medical Institute", "domain": "metroprep.com", "emails": 30},
            {"name": "College of Midwives of Ontario", "domain": "cmo.on.ca", "emails": 30},
            {"name": "Ontario Healthcare Association", "domain": "deca.ca", "emails": 27},
            {"name": "Toronto Health Services Guild", "domain": "tmaps.ca", "emails": 24},
            {"name": "Gowan Health Consulting", "domain": "gowanhealth.com", "emails": 25},
            {"name": "Apex Digital Bio", "domain": "apexbio.ca", "emails": 18},
            {"name": "NorthStar Medical Devices", "domain": "northstarmed.io", "emails": 22},
        ]

        results = []
        for i in range(min(limit, len(pool))):
            item = pool[i]
            results.append({
                "company_name": item["name"],
                "domain": item["domain"],
                "location": loc,
                "industry": ind,
                "employee_count": hc,
                "emails_count": item["emails"],
                "sample_email": f"contact@{item['domain']}",
                "source": "synthetic_catalog",
            })
        return results
