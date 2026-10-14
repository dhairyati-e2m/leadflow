import hashlib
import logging
from typing import Any, Dict, List, Literal, Optional
import httpx

from backend.app.core.config import settings
from backend.app.core.quota import QuotaManager
from backend.app.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)

# Cache for deduplication of search queries in this process session
_QUERY_CACHE: Dict[str, List[Dict[str, Any]]] = {}


class BraveSearchProvider(BaseProvider):
    """
    Brave Search API Adapter for company discovery and public evidence gathering.
    Free Tier: 2,000 queries/month free recurring (1 req/sec).
    """

    BASE_URL: str = "https://api.search.brave.com/res/v1/web/search"

    def __init__(
        self,
        api_key: Optional[str] = None,
        mode: Optional[Literal["mock", "live", "disabled"]] = None,
        timeout_seconds: float = 10.0,
    ):
        provider_mode = mode or settings.PROVIDER_BRAVE_MODE
        super().__init__(
            key="brave",
            name="Brave Search API",
            mode=provider_mode,
        )
        self.api_key = api_key or settings.BRAVE_API_KEY
        self.timeout_seconds = timeout_seconds

    def _hash_query(self, query: str) -> str:
        return hashlib.sha256(query.strip().lower().encode("utf-8")).hexdigest()

    async def execute(self, target: str, count: int = 5, **kwargs: Any) -> ProviderResult:
        """
        Execute a search query against Brave Search API.
        Target is the search query string (e.g., 'site:acme.com about us' or company name).
        """
        query = target.strip()
        if not query:
            return ProviderResult(
                provider_key=self.key,
                status="error",
                error_message="Search query target cannot be empty.",
            )

        if self.mode == "disabled":
            return ProviderResult(
                provider_key=self.key,
                status="disabled",
                data={"results": [], "query": query},
            )

        query_hash = self._hash_query(query)

        # 1. Deduplication Cache Check
        if query_hash in _QUERY_CACHE:
            logger.info("Brave Search cache hit for query: '%s' (0 quota consumed)", query)
            return ProviderResult(
                provider_key=self.key,
                status="success",
                data={"results": _QUERY_CACHE[query_hash], "query": query, "cached": True},
                quota_consumed=0,
            )

        # 2. Mock Mode
        if self.mode == "mock" or not self.api_key:
            mock_results = self._generate_mock_results(query, count)
            return ProviderResult(
                provider_key=self.key,
                status="mock",
                data={"results": mock_results, "query": query, "synthetic": True},
                quota_consumed=0,
            )

        # 3. Quota Reservation & Circuit Breaker Check
        allowed, reason, quota_status = await QuotaManager.check_and_reserve("brave", metric="requests", count=1)
        if not allowed:
            logger.warning("Brave quota denied (%s). Falling back to synthetic results.", reason)
            mock_results = self._generate_mock_results(query, count)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={"results": mock_results, "query": query, "fallback_reason": reason},
                quota_consumed=0,
                error_message=reason,
            )

        # 4. Live Outbound HTTP Request
        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": self.api_key,
        }
        params = {
            "q": query,
            "count": min(count, 10),
            "text_decorations": "false",
            "result_filter": "web",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.get(self.BASE_URL, headers=headers, params=params)

            if resp.status_code == 200:
                payload = resp.json()
                web_results = payload.get("web", {}).get("results", [])
                formatted = [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "description": r.get("description", ""),
                        "domain": r.get("profile", {}).get("long_name") or r.get("url", "").split("/")[2] if "/" in r.get("url", "") else "",
                    }
                    for r in web_results
                ]
                _QUERY_CACHE[query_hash] = formatted
                return ProviderResult(
                    provider_key=self.key,
                    status="success",
                    data={"results": formatted, "query": query, "raw_count": len(formatted)},
                    quota_consumed=1,
                    quota_remaining=quota_status.get("monthly_limit", 1600) - quota_status.get("monthly_used", 0) if quota_status.get("monthly_limit") else None,
                )
            else:
                await QuotaManager.release_reservation("brave", metric="requests", count=1)
                logger.error("Brave Search API returned error HTTP %d: %s", resp.status_code, resp.text)
                return ProviderResult(
                    provider_key=self.key,
                    status="fallback",
                    data={"results": self._generate_mock_results(query, count), "query": query},
                    quota_consumed=0,
                    error_message=f"Brave API returned HTTP {resp.status_code}",
                )

        except Exception as exc:
            await QuotaManager.release_reservation("brave", metric="requests", count=1)
            logger.error("Brave Search request failed: %s", exc)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={"results": self._generate_mock_results(query, count), "query": query},
                quota_consumed=0,
                error_message=str(exc),
            )

    def _generate_mock_results(self, query: str, count: int) -> List[Dict[str, Any]]:
        clean_q = query.replace("site:", "").replace("\"", "").strip()
        slug = clean_q.replace(" ", "-").lower()
        return [
            {
                "title": f"{clean_q.title()} - Official Website & Solutions",
                "url": f"https://www.{slug}.com",
                "description": f"{clean_q.title()} provides advanced SaaS infrastructure, enterprise services, and operations automation.",
                "domain": f"{slug}.com",
            },
            {
                "title": f"About {clean_q.title()} | Careers & Leadership Team",
                "url": f"https://www.{slug}.com/about",
                "description": f"Learn about the mission, engineering values, and executive leadership behind {clean_q.title()}.",
                "domain": f"{slug}.com",
            },
            {
                "title": f"{clean_q.title()} Pricing, Plans, and Enterprise Security",
                "url": f"https://www.{slug}.com/pricing",
                "description": f"Transparent tier pricing, SOC2 compliance reports, and integration options for {clean_q.title()}.",
                "domain": f"{slug}.com",
            },
        ][:count]

    def get_quota_info(self) -> Dict[str, Any]:
        limits = QuotaManager.get_provider_limits(self.key)
        return {
            "provider": self.key,
            "monthly_limit": limits.get("monthly", 1600),
            "daily_limit": limits.get("daily", 50),
            "mode": self.mode,
            "is_configured": bool(self.api_key),
        }
