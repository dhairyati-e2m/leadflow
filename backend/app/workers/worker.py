import asyncio
import logging
from typing import Any, Dict

from arq.connections import RedisSettings

from backend.app.core.config import settings
from backend.app.workers.arq_pool import get_redis_settings
from backend.app.workers.tasks import process_batch_run_job, process_lead_pipeline_job

logger = logging.getLogger("leadflow.worker")


async def startup(ctx: Dict[str, Any]) -> None:
    logger.info("LeadFlow ARQ background worker starting up...")
    logger.info("Connected to Redis: %s", settings.REDIS_URL)


async def shutdown(ctx: Dict[str, Any]) -> None:
    logger.info("LeadFlow ARQ background worker shutting down cleanly.")


class WorkerSettings:
    """ARQ Worker configuration specification."""
    functions = [
        process_batch_run_job,
        process_lead_pipeline_job,
    ]
    redis_settings: RedisSettings = get_redis_settings()
    max_jobs: int = 10
    job_timeout: int = 300  # 5 minutes
    on_startup = startup
    on_shutdown = shutdown
