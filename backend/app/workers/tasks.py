import asyncio
from typing import Any, Dict
from arq.connections import RedisSettings

from backend.app.core.config import settings
from backend.app.domain.crawler.safe_crawler import SafeWebCrawler
from backend.app.domain.scoring import calculate_overall_score
from backend.app.domain.signals.evaluators import evaluate_all_signals


async def ping_task(ctx: Dict[Any, Any], message: str = "pong") -> Dict[str, Any]:
    """Minimal ARQ background verification job."""
    return {"status": "success", "echo": message}


async def enrich_and_score_lead_job(
    ctx: Dict[Any, Any],
    lead_id: str,
    org_id: str,
    target_url: str,
) -> Dict[str, Any]:
    """
    Background worker job:
    1. Fetches company site safely via SafeWebCrawler
    2. Evaluates all 22 qualification signals
    3. Calculates deterministic overall score and qualification band
    """
    crawler = SafeWebCrawler(
        max_bytes=settings.CRAWLER_MAX_RESPONSE_BYTES,
        timeout_seconds=float(settings.CRAWLER_TIMEOUT_SECONDS),
    )
    crawl_data = await crawler.fetch_page(target_url)
    signals = evaluate_all_signals(crawl_data)
    score_result = calculate_overall_score(signals)

    return {
        "lead_id": lead_id,
        "org_id": org_id,
        "url": target_url,
        "final_score": score_result.final_score,
        "band": score_result.qualification_band.value,
        "signals_count": len(signals),
    }


async def startup(ctx: Dict[Any, Any]) -> None:
    pass


async def shutdown(ctx: Dict[Any, Any]) -> None:
    pass


class WorkerSettings:
    """ARQ Worker configuration settings."""
    functions = [ping_task, enrich_and_score_lead_job]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 10
    job_timeout = 60
