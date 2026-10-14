import hashlib
import logging
from typing import Any, Dict, List, Literal, Optional
import httpx

from backend.app.core.config import settings
from backend.app.core.quota import QuotaManager
from backend.app.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)

_SERP_CACHE: Dict[str, List[Dict[str, Any]]] = {}


class SerpApiProvider(BaseProvider):
    """
    SerpApi Adapter for search-based company discovery and public search evidence.
    Free Tier: 100 searches/month free recurring.
    Safety Limit: 80 searches/month.
    """

    BASE_URL: str = "https://serpapi.com/search.json"

    def __init__(
        self,
        api_key: Optional[str] = None,
        mode: Optional[Literal["mock", "live", "disabled"]] = None,
        timeout_seconds: float = 12.0,
    ):
        provider_mode = mode or settings.PROVIDER_SERPAPI_MODE
        super().__init__(
            key="serpapi",
            name="SerpApi Google Search",
            mode=provider_mode,
        )
        self.api_key = api_key or settings.SERPAPI_API_KEY
        self.timeout_seconds = timeout_seconds

    def _hash_query(self, query: str) -> str:
        return hashlib.sha256(query.strip().lower().encode("utf-8")).hexdigest()

    async def execute(self, target: str, num_results: int = 5, **kwargs: Any) -> ProviderResult:
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

        # 1. Deduplication cache check
        if query_hash in _SERP_CACHE:
            logger.info("SerpApi deduplication cache hit for query '%s' (0 quota consumed)", query)
            return ProviderResult(
                provider_key=self.key,
                status="success",
                data={"results": _SERP_CACHE[query_hash], "query": query, "cached": True},
                quota_consumed=0,
            )

        # 2. Mock mode
        if self.mode == "mock" or not self.api_key:
            mock_data = self._generate_mock_results(query, num_results)
            return ProviderResult(
                provider_key=self.key,
                status="mock",
                data={"results": mock_data, "query": query, "synthetic": True},
                quota_consumed=0,
            )

        # 3. Quota reservation & Circuit Breaker Check
        allowed, reason, quota_status = await QuotaManager.check_and_reserve("serpapi", metric="requests", count=1)
        if not allowed:
            logger.warning("SerpApi quota denied (%s). Falling back to mock results.", reason)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={"results": self._generate_mock_results(query, num_results), "query": query, "fallback_reason": reason},
                quota_consumed=0,
                error_message=reason,
            )

        # 4. Live Outbound Request
        params = {
            "engine": "google",
            "q": query,
            "num": min(num_results, 10),
            "api_key": self.api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.get(self.BASE_URL, params=params)

            if resp.status_code == 200:
                body = resp.json()
                organic_results = body.get("organic_results", [])
                formatted = [
                    {
                        "title": item.get("title", ""),
                        "link": item.get("link", ""),
                        "snippet": item.get("snippet", ""),
                        "position": item.get("position"),
                    }
                    for item in organic_results
                ]
                _SERP_CACHE[query_hash] = formatted
                return ProviderResult(
                    provider_key=self.key,
                    status="success",
                    data={"results": formatted, "query": query, "raw_count": len(formatted)},
                    quota_consumed=1,
                )
            else:
                await QuotaManager.release_reservation("serpapi", metric="requests", count=1)
                logger.error("SerpApi error HTTP %d: %s", resp.status_code, resp.text)
                return ProviderResult(
                    provider_key=self.key,
                    status="fallback",
                    data={"results": self._generate_mock_results(query, num_results), "query": query},
                    quota_consumed=0,
                    error_message=f"SerpApi returned HTTP {resp.status_code}",
                )

        except Exception as exc:
            await QuotaManager.release_reservation("serpapi", metric="requests", count=1)
            logger.error("SerpApi request failed: %s", exc)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={"results": self._generate_mock_results(query, num_results), "query": query},
                quota_consumed=0,
                error_message=str(exc),
            )

    def _generate_mock_results(self, query: str, count: int) -> List[Dict[str, Any]]:
        clean_name = query.replace("site:", "").replace("\"", "").strip()
        slug = clean_name.replace(" ", "-").lower()
        return [
            {
                "title": f"{clean_name.title()} - B2B Technology & Platform Services",
                "link": f"https://www.{slug}.io",
                "snippet": f"{clean_name.title()} delivers modern enterprise solutions, cloud security, and workflow automation.",
                "position": 1,
            },
            {
                "title": f"Inside {clean_name.title()}: Leadership, Careers & Culture",
                "link": f"https://www.{slug}.io/company",
                "snippet": f"Meet the executive team building scalable enterprise tools at {clean_name.title()}.",
                "position": 2,
            },
        ][:count]

    def get_quota_info(self) -> Dict[str, Any]:
        limits = QuotaManager.get_provider_limits(self.key)
        return {
            "provider": self.key,
            "monthly_limit": limits.get("monthly", 80),
            "mode": self.mode,
            "is_configured": bool(self.api_key),
        }
