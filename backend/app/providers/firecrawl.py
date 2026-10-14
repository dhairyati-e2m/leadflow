import logging
from typing import Any, Dict, Literal, Optional
from urllib.parse import urlparse
import httpx

from backend.app.core.config import settings
from backend.app.core.quota import QuotaManager
from backend.app.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)


class FirecrawlProvider(BaseProvider):
    """
    Firecrawl Web Scraper Provider Adapter.
    Free Tier Allowance: 1,000 credits/month, 10 requests/minute (RPM).
    Safety Quota: 800 credits/month, 8 RPM.
    Provides JavaScript-rendered page scraping and clean Markdown extraction.
    Strictly backend-enforced, off-by-default, zero paid upgrades.
    """

    BASE_URL: str = "https://api.firecrawl.dev/v1/scrape"

    def __init__(
        self,
        api_key: Optional[str] = None,
        mode: Optional[Literal["mock", "live", "disabled"]] = None,
        timeout_seconds: float = 15.0,
    ):
        provider_mode = mode or settings.PROVIDER_FIRECRAWL_MODE
        super().__init__(
            key="firecrawl",
            name="Firecrawl Web Scraper",
            mode=provider_mode,
        )
        self.api_key = api_key or settings.FIRECRAWL_API_KEY
        self.timeout_seconds = timeout_seconds

    def get_quota_info(self) -> Dict[str, Any]:
        limits = QuotaManager.get_provider_limits(self.key)
        return {
            "monthly_limit": limits.get("monthly", settings.FIRECRAWL_MONTHLY_LIMIT),
            "daily_limit": limits.get("daily", 30),
            "rpm_limit": limits.get("rpm", settings.FIRECRAWL_RPM_LIMIT),
            "tier": "free_limited",
            "free_allowance": "1,000 credits/month recurring (1 credit/page scrape)",
        }

    async def execute(self, target: str, **kwargs: Any) -> ProviderResult:
        """
        Scrapes a target website URL using Firecrawl's /v1/scrape endpoint.
        target: Website URL (e.g. 'https://acme.com')
        """
        url = target.strip()
        if not url:
            return ProviderResult(
                provider_key=self.key,
                status="error",
                error_message="Invalid target URL for Firecrawl scraping.",
            )
        if not url.startswith("http://") and not url.startswith("https://"):
            url = f"https://{url}"

        parsed = urlparse(url)
        if not parsed.netloc or not parsed.hostname:
            return ProviderResult(
                provider_key=self.key,
                status="error",
                error_message="Invalid target URL for Firecrawl scraping.",
            )

        if self.mode == "disabled":
            return ProviderResult(
                provider_key=self.key,
                status="disabled",
                data={"url": url, "scraped": False},
                quota_consumed=0,
            )

        # Mock Mode: Deterministic synthetic data for zero-cost offline development & tests
        if self.mode == "mock" or not self.api_key:
            logger.info("[MOCK FIRECRAWL] Simulated scrape for %s", url)
            return ProviderResult(
                provider_key=self.key,
                status="mock",
                data={
                    "success": True,
                    "data": {
                        "markdown": f"# {parsed.netloc}\n\nLeading provider of B2B SaaS solutions and intelligent pipeline automation.",
                        "metadata": {
                            "title": f"{parsed.netloc} — Enterprise Platform",
                            "description": f"Official website of {parsed.netloc}.",
                            "statusCode": 200,
                            "sourceURL": url,
                        },
                        "html": f"<html><head><title>{parsed.netloc}</title></head><body><h1>Enterprise</h1></body></html>",
                    },
                    "synthetic": True,
                },
                quota_consumed=0,
            )

        # 1. Atomic Quota Check & Reservation
        allowed, reason, quota_status = await QuotaManager.check_and_reserve("firecrawl", metric="requests", count=1)
        if not allowed:
            logger.warning("[FIRECRAWL QUOTA BLOCKED] %s", reason)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={"url": url, "fallback_reason": reason},
                error_message=reason,
                quota_consumed=0,
            )

        # 2. Live HTTP Request to Firecrawl API
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "url": url,
            "formats": ["markdown", "html"],
            "onlyMainContent": False,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(self.BASE_URL, json=payload, headers=headers)

                if resp.status_code == 200:
                    resp_data = resp.json()
                    return ProviderResult(
                        provider_key=self.key,
                        status="success",
                        data=resp_data,
                        quota_consumed=1,
                    )
                elif resp.status_code == 429:
                    logger.warning("Firecrawl Rate Limit / Quota Exceeded (429): %s", resp.text)
                    return ProviderResult(
                        provider_key=self.key,
                        status="error",
                        error_message="Firecrawl rate limit exceeded (429).",
                        quota_consumed=0,
                    )
                else:
                    logger.error("Firecrawl API error (%d): %s", resp.status_code, resp.text)
                    return ProviderResult(
                        provider_key=self.key,
                        status="error",
                        error_message=f"Firecrawl returned HTTP {resp.status_code}: {resp.text[:200]}",
                        quota_consumed=0,
                    )
        except Exception as exc:
            logger.error("Firecrawl HTTP request exception: %s", exc)
            return ProviderResult(
                provider_key=self.key,
                status="error",
                error_message=f"Firecrawl connection failed: {str(exc)}",
                quota_consumed=0,
            )
