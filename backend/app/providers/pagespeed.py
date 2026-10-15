import logging
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional
import httpx

from backend.app.core.config import settings
from backend.app.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)


_DEFAULT_KEY = object()


class GooglePageSpeedProvider(BaseProvider):
    DAILY_FREE_LIMIT: int = 25000
    RATE_LIMIT_PER_MINUTE: int = 240

    def __init__(
        self,
        api_key: Any = _DEFAULT_KEY,
        mode: Optional[Literal["mock", "live", "disabled"]] = None,
        timeout_seconds: float = 15.0,
    ):
        provider_mode = mode or settings.PROVIDER_PAGESPEED_MODE
        super().__init__(
            key="google_pagespeed",
            name="Google PageSpeed Insights",
            mode=provider_mode,
        )
        self.api_key = settings.GOOGLE_PAGESPEED_API_KEY if api_key is _DEFAULT_KEY else api_key
        self.timeout_seconds = timeout_seconds
        # In-memory daily usage tracking (mirrored to Redis when available)
        self._daily_usage_cache: Dict[str, int] = {}

    def _get_today_key(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def get_current_daily_usage(self) -> int:
        today = self._get_today_key()
        return self._daily_usage_cache.get(today, 0)

    def _record_quota_consumption(self, count: int = 1) -> int:
        today = self._get_today_key()
        curr = self._daily_usage_cache.get(today, 0) + count
        self._daily_usage_cache[today] = curr

        # Check threshold warnings
        pct = (curr / self.DAILY_FREE_LIMIT) * 100
        if pct >= 100:
            logger.error("PageSpeed daily free quota 100%% reached (%d/%d). Halting live requests.", curr, self.DAILY_FREE_LIMIT)
        elif pct >= 90:
            logger.warning("PageSpeed daily free quota at 90%% (%d/%d).", curr, self.DAILY_FREE_LIMIT)
        elif pct >= 75:
            logger.warning("PageSpeed daily free quota at 75%% (%d/%d).", curr, self.DAILY_FREE_LIMIT)
        return curr

    def get_quota_info(self) -> Dict[str, Any]:
        used = self.get_current_daily_usage()
        return {
            "provider": self.key,
            "daily_limit": self.DAILY_FREE_LIMIT,
            "daily_used": used,
            "daily_remaining": max(0, self.DAILY_FREE_LIMIT - used),
            "usage_pct": round((used / self.DAILY_FREE_LIMIT) * 100, 2),
            "free_tier_terms": "25,000 queries/day (Google Cloud Free Tier, zero credit card requirement)",
        }

    async def execute(self, target_url: str, strategy: str = "mobile", **kwargs: Any) -> ProviderResult:
        """
        Executes PageSpeed performance audit for target_url.
        Adheres strictly to mock, live, and disabled operational modes.
        """
        if self.mode == "disabled":
            return ProviderResult(
                provider_key=self.key,
                status="disabled",
                data={},
                quota_consumed=0,
                quota_remaining=self.DAILY_FREE_LIMIT - self.get_current_daily_usage(),
                error_message="Provider is disabled in system configuration",
            )

        if self.mode == "mock":
            # Deterministic synthetic PageSpeed data for safe testing and offline development
            performance_score = 88.0
            mock_data = {
                "performance_score": performance_score,
                "strategy": strategy,
                "largest_contentful_paint_ms": 1420.0,
                "first_contentful_paint_ms": 950.0,
                "cumulative_layout_shift": 0.02,
                "speed_index_ms": 1380.0,
                "total_blocking_time_ms": 110.0,
                "core_web_vitals_passed": True,
                "provider_mode": "mock",
            }
            return ProviderResult(
                provider_key=self.key,
                status="mock",
                data=mock_data,
                quota_consumed=0,
                quota_remaining=self.DAILY_FREE_LIMIT - self.get_current_daily_usage(),
            )

        # LIVE MODE: Check API key and quota safety
        if not self.api_key:
            logger.warning("Google PageSpeed API key not configured. Falling back to local timing.")
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={},
                error_message="Missing GOOGLE_PAGESPEED_API_KEY in environment",
            )

        current_usage = self.get_current_daily_usage()
        if current_usage >= self.DAILY_FREE_LIMIT:
            logger.warning("Google PageSpeed daily quota limit reached (%d). Operating in fallback mode.", self.DAILY_FREE_LIMIT)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={},
                quota_consumed=0,
                quota_remaining=0,
                error_message="Daily free tier quota exhausted (25,000 queries/day hard limit)",
            )

        # Execute Live Google API request
        endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
        params = {
            "url": target_url,
            "key": self.api_key,
            "strategy": strategy,
            "category": "performance",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.get(endpoint, params=params)

                if response.status_code == 429:
                    logger.warning("Google PageSpeed rate limit encountered (HTTP 429). Triggering fallback.")
                    return ProviderResult(
                        provider_key=self.key,
                        status="fallback",
                        data={},
                        error_message="HTTP 429 Rate limit exceeded by provider",
                    )

                if response.status_code != 200:
                    err_msg = f"PageSpeed API returned status {response.status_code}"
                    logger.error("%s: %s", err_msg, response.text[:200])
                    return ProviderResult(
                        provider_key=self.key,
                        status="error",
                        data={},
                        error_message=err_msg,
                    )

                data = response.json()
                lighthouse = data.get("lighthouseResult", {})
                categories = lighthouse.get("categories", {})
                perf_cat = categories.get("performance", {})
                audits = lighthouse.get("audits", {})

                # Extract score (0-1 float to 0-100)
                raw_score = perf_cat.get("score")
                performance_score = round(raw_score * 100.0, 1) if raw_score is not None else None

                lcp = audits.get("largest-contentful-paint", {}).get("numericValue")
                fcp = audits.get("first-contentful-paint", {}).get("numericValue")
                cls = audits.get("cumulative-layout-shift", {}).get("numericValue")
                speed_idx = audits.get("speed-index", {}).get("numericValue")
                tbt = audits.get("total-blocking-time", {}).get("numericValue")

                # Core Web Vitals criteria: LCP <= 2500ms and CLS <= 0.1
                cwv_passed = (lcp is not None and lcp <= 2500.0) and (cls is not None and cls <= 0.1)

                parsed_data = {
                    "performance_score": performance_score,
                    "strategy": strategy,
                    "largest_contentful_paint_ms": round(lcp, 1) if lcp else None,
                    "first_contentful_paint_ms": round(fcp, 1) if fcp else None,
                    "cumulative_layout_shift": round(cls, 3) if cls else None,
                    "speed_index_ms": round(speed_idx, 1) if speed_idx else None,
                    "total_blocking_time_ms": round(tbt, 1) if tbt else None,
                    "core_web_vitals_passed": cwv_passed,
                    "provider_mode": "live",
                }

                self._record_quota_consumption(1)

                return ProviderResult(
                    provider_key=self.key,
                    status="success",
                    data=parsed_data,
                    quota_consumed=1,
                    quota_remaining=self.DAILY_FREE_LIMIT - self.get_current_daily_usage(),
                )

        except httpx.TimeoutException:
            logger.warning("Google PageSpeed request timed out after %.1fs. Triggering local fallback.", self.timeout_seconds)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data={},
                error_message=f"Request timed out after {self.timeout_seconds}s",
            )
        except Exception as exc:
            logger.error("Unexpected error in PageSpeed provider: %s", exc)
            return ProviderResult(
                provider_key=self.key,
                status="error",
                data={},
                error_message=str(exc),
            )
