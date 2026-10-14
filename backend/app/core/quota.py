import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Fallback in-memory tracking if Redis is unreachable
_MEMORY_QUOTA_STORE: Dict[str, int] = {}


class QuotaLimitExceededError(Exception):
    """Raised when an external API call is blocked by safety quotas."""
    pass


class KillSwitchActiveError(Exception):
    """Raised when the global kill switch is turned on."""
    pass


class QuotaManager:
    """
    Centralized Quota & Rate-Limit Manager.
    Enforces strict safety buffers on genuinely free tier APIs (Brave, Gemini, SerpApi, Hunter, Resend).
    Prevents paid charges with 100% circuit breaking and multi-tier threshold alerts.
    """

    # Provider limit definitions: (daily_limit, monthly_limit, rpm_limit)
    @classmethod
    def get_provider_limits(cls, provider: str) -> Dict[str, Optional[int]]:
        p = provider.lower()
        if p == "brave":
            return {
                "daily": settings.BRAVE_DAILY_LIMIT,
                "monthly": settings.BRAVE_MONTHLY_LIMIT,
                "rpm": settings.BRAVE_RATE_LIMIT_PER_SECOND * 60,
            }
        elif p == "gemini":
            return {
                "daily": settings.GEMINI_DAILY_LIMIT,
                "monthly": None,
                "rpm": settings.GEMINI_RPM_LIMIT,
            }
        elif p == "serpapi":
            return {
                "daily": 15,  # Daily safety guard
                "monthly": settings.SERPAPI_MONTHLY_LIMIT,
                "rpm": 5,
            }
        elif p == "hunter":
            return {
                "daily": 10,
                "monthly": settings.HUNTER_MONTHLY_LIMIT,
                "rpm": 5,
            }
        elif p == "hunter_verify":
            return {
                "daily": 20,
                "monthly": settings.HUNTER_VERIFY_MONTHLY_LIMIT,
                "rpm": 10,
            }
        elif p == "resend":
            return {
                "daily": settings.RESEND_DAILY_LIMIT,
                "monthly": 2400,
                "rpm": 10,
            }
        elif p == "google_pagespeed":
            return {
                "daily": 25000,
                "monthly": None,
                "rpm": 240,
            }
        elif p == "firecrawl":
            return {
                "daily": 30,
                "monthly": settings.FIRECRAWL_MONTHLY_LIMIT,
                "rpm": settings.FIRECRAWL_RPM_LIMIT,
            }
        return {"daily": None, "monthly": None, "rpm": None}

    @classmethod
    def _get_keys(cls, provider: str, metric: str = "req") -> Tuple[str, str, str]:
        now = datetime.now(timezone.utc)
        day_str = now.strftime("%Y-%m-%d")
        month_str = now.strftime("%Y-%m")
        minute_str = now.strftime("%Y-%m-%d-%H-%M")

        day_key = f"quota:{provider}:{metric}:day:{day_str}"
        month_key = f"quota:{provider}:{metric}:month:{month_str}"
        min_key = f"quota:{provider}:{metric}:min:{minute_str}"
        return day_key, month_key, min_key

    @classmethod
    async def check_and_reserve(
        cls,
        provider: str,
        metric: str = "requests",
        count: int = 1,
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """
        Atomically checks limits and reserves quota before an external API call.
        Returns (is_allowed, denial_reason, usage_summary).
        """
        # 1. Global Kill Switch Check
        if settings.GLOBAL_EXTERNAL_API_KILL_SWITCH:
            msg = "Global external API kill switch is active. Outbound call blocked."
            logger.warning("[KILL SWITCH] Provider %s blocked: %s", provider, msg)
            return False, msg, {"blocked_by": "global_kill_switch"}

        limits = cls.get_provider_limits(provider)
        day_limit = limits.get("daily")
        month_limit = limits.get("monthly")
        rpm_limit = limits.get("rpm")

        day_key, month_key, min_key = cls._get_keys(provider, metric)

        # 2. Redis-backed Atomic Increment & Verification
        redis = None
        try:
            from backend.app.workers.arq_pool import get_arq_redis_pool
            redis = await get_arq_redis_pool()
        except Exception as e:
            logger.debug("Redis connection unavailable for QuotaManager, using in-memory: %s", e)

        day_used = 0
        month_used = 0
        min_used = 0

        if redis:
            try:
                # Read current usage first
                pipe = redis.pipeline()
                pipe.get(day_key)
                pipe.get(month_key)
                pipe.get(min_key)
                res = await pipe.execute()

                day_used = int(res[0]) if res[0] else 0
                month_used = int(res[1]) if res[1] else 0
                min_used = int(res[2]) if res[2] else 0

                # Validate Rate Limit (RPM)
                if rpm_limit and (min_used + count) > rpm_limit:
                    return False, f"Provider '{provider}' rate limit exceeded ({min_used}/{rpm_limit} RPM).", {
                        "provider": provider,
                        "rpm_used": min_used,
                        "rpm_limit": rpm_limit,
                    }

                # Validate Daily Quota
                if day_limit and (day_used + count) > day_limit:
                    logger.error(
                        "CIRCUIT BREAKER: Free quota daily limit reached for %s (%d/%d). Pausing calls.",
                        provider, day_used, day_limit
                    )
                    return False, f"Free daily quota limit reached ({day_used}/{day_limit}) for {provider}.", {
                        "provider": provider,
                        "daily_used": day_used,
                        "daily_limit": day_limit,
                    }

                # Validate Monthly Quota
                if month_limit and (month_used + count) > month_limit:
                    logger.error(
                        "CIRCUIT BREAKER: Free quota monthly limit reached for %s (%d/%d). Pausing calls.",
                        provider, month_used, month_limit
                    )
                    return False, f"Free monthly quota limit reached ({month_used}/{month_limit}) for {provider}.", {
                        "provider": provider,
                        "monthly_used": month_used,
                        "monthly_limit": month_limit,
                    }

                # Increment atomically with appropriate TTLs
                inc_pipe = redis.pipeline()
                inc_pipe.incrby(day_key, count)
                inc_pipe.expire(day_key, 86400 * 2)  # 2 days retention
                inc_pipe.incrby(month_key, count)
                inc_pipe.expire(month_key, 86400 * 45)  # 45 days retention
                if rpm_limit:
                    inc_pipe.incrby(min_key, count)
                    inc_pipe.expire(min_key, 120)  # 2 minutes retention
                inc_res = await inc_pipe.execute()

                day_used = inc_res[0]
                month_used = inc_res[2]

            except Exception as re:
                logger.warning("Redis quota increment error, falling back to memory: %s", re)
                redis = None

        if not redis:
            # Fallback to Memory
            day_used = _MEMORY_QUOTA_STORE.get(day_key, 0)
            month_used = _MEMORY_QUOTA_STORE.get(month_key, 0)
            min_used = _MEMORY_QUOTA_STORE.get(min_key, 0)

            if rpm_limit and (min_used + count) > rpm_limit:
                return False, f"Provider '{provider}' rate limit exceeded ({min_used}/{rpm_limit} RPM).", {
                    "provider": provider,
                    "rpm_used": min_used,
                    "rpm_limit": rpm_limit,
                }
            if day_limit and (day_used + count) > day_limit:
                return False, f"Free daily quota limit reached ({day_used}/{day_limit}) for {provider}.", {
                    "provider": provider,
                    "daily_used": day_used,
                    "daily_limit": day_limit,
                }
            if month_limit and (month_used + count) > month_limit:
                return False, f"Free monthly quota limit reached ({month_used}/{month_limit}) for {provider}.", {
                    "provider": provider,
                    "monthly_used": month_used,
                    "monthly_limit": month_limit,
                }

            _MEMORY_QUOTA_STORE[day_key] = day_used + count
            _MEMORY_QUOTA_STORE[month_key] = month_used + count
            _MEMORY_QUOTA_STORE[min_key] = min_used + count
            day_used += count
            month_used += count

        # 3. Threshold Warning Logs (50%, 75%, 90%)
        cls._check_threshold_warnings(provider, day_used, day_limit, "daily")
        cls._check_threshold_warnings(provider, month_used, month_limit, "monthly")

        return True, None, {
            "provider": provider,
            "daily_used": day_used,
            "daily_limit": day_limit,
            "monthly_used": month_used,
            "monthly_limit": month_limit,
        }

    @classmethod
    def _check_threshold_warnings(
        cls,
        provider: str,
        used: int,
        limit: Optional[int],
        period: str,
    ) -> None:
        if not limit or limit <= 0:
            return
        pct = (used / limit) * 100.0
        if pct >= 90.0:
            logger.warning(
                "[QUOTA ALERT 90%%] Provider '%s' %s usage reached %.1f%% (%d/%d). Approaching circuit breaker.",
                provider, period, pct, used, limit
            )
        elif pct >= 75.0:
            logger.warning(
                "[QUOTA ALERT 75%%] Provider '%s' %s usage reached %.1f%% (%d/%d).",
                provider, period, pct, used, limit
            )
        elif pct >= 50.0:
            logger.info(
                "[QUOTA INFO 50%%] Provider '%s' %s usage reached %.1f%% (%d/%d).",
                provider, period, pct, used, limit
            )

    @classmethod
    async def release_reservation(
        cls,
        provider: str,
        metric: str = "requests",
        count: int = 1,
    ) -> None:
        """Rollback reservation if an outbound call failed before network dispatch."""
        day_key, month_key, _ = cls._get_keys(provider, metric)
        try:
            from backend.app.workers.arq_pool import get_arq_redis_pool
            redis = await get_arq_redis_pool()
            pipe = redis.pipeline()
            pipe.decrby(day_key, count)
            pipe.decrby(month_key, count)
            await pipe.execute()
        except Exception:
            if day_key in _MEMORY_QUOTA_STORE:
                _MEMORY_QUOTA_STORE[day_key] = max(0, _MEMORY_QUOTA_STORE[day_key] - count)
            if month_key in _MEMORY_QUOTA_STORE:
                _MEMORY_QUOTA_STORE[month_key] = max(0, _MEMORY_QUOTA_STORE[month_key] - count)

    @classmethod
    async def get_usage_summary(cls, provider: str) -> Dict[str, Any]:
        """Returns current daily and monthly usage against configured limits."""
        limits = cls.get_provider_limits(provider)
        day_limit = limits.get("daily")
        month_limit = limits.get("monthly")
        day_key, month_key, _ = cls._get_keys(provider, "requests")

        day_used = 0
        month_used = 0

        try:
            from backend.app.workers.arq_pool import get_arq_redis_pool
            redis = await get_arq_redis_pool()
            d_val = await redis.get(day_key)
            m_val = await redis.get(month_key)
            day_used = int(d_val) if d_val else 0
            month_used = int(m_val) if m_val else 0
        except Exception:
            day_used = _MEMORY_QUOTA_STORE.get(day_key, 0)
            month_used = _MEMORY_QUOTA_STORE.get(month_key, 0)

        return {
            "provider": provider,
            "daily_used": day_used,
            "daily_limit": day_limit,
            "daily_remaining": max(0, day_limit - day_used) if day_limit else None,
            "monthly_used": month_used,
            "monthly_limit": month_limit,
            "monthly_remaining": max(0, month_limit - month_used) if month_limit else None,
            "kill_switch_active": settings.GLOBAL_EXTERNAL_API_KILL_SWITCH,
        }
