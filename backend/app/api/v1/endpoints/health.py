from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter
from sqlalchemy import text
from redis.asyncio import Redis

from backend.app.core.config import settings
from backend.app.core.database import get_session_factory

router = APIRouter()


@router.get("/health", summary="Liveness Probe")
async def get_health() -> Dict[str, Any]:
    """
    Returns immediate 200 OK liveness status.
    Indicates FastAPI server process is running and accepting traffic.
    """
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "providers": {
            "enrichment": settings.PROVIDER_ENRICHMENT_MODE,
            "pagespeed": settings.PROVIDER_PAGESPEED_MODE,
            "hubspot": settings.PROVIDER_HUBSPOT_MODE,
            "llm": settings.LLM_PROVIDER,
        },
    }


@router.get("/ready", summary="Readiness Probe")
async def get_readiness() -> Dict[str, Any]:
    """
    Evaluates backend readiness, checking connectivity to PostgreSQL and Redis.
    Gracefully reports degraded status when dependencies are disconnected without crashing.
    """
    checks: Dict[str, str] = {}
    is_ready = True

    # 1. Check PostgreSQL connectivity
    try:
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(text("SELECT 1"))
            val = result.scalar()
            checks["postgres"] = "connected" if val == 1 else "unhealthy"
    except Exception as exc:
        checks["postgres"] = f"disconnected ({type(exc).__name__})"
        is_ready = False

    # 2. Check Redis connectivity
    try:
        r = Redis.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
            retry_on_timeout=False,
        )
        pong = await r.ping()
        checks["redis"] = "connected" if pong else "unhealthy"
        await r.aclose()
    except Exception as exc:
        checks["redis"] = f"disconnected ({type(exc).__name__})"
        is_ready = False

    return {
        "status": "ready" if is_ready else "degraded",
        "dependencies": checks,
        "active_modes": {
            "enrichment": settings.PROVIDER_ENRICHMENT_MODE,
            "pagespeed": settings.PROVIDER_PAGESPEED_MODE,
            "hubspot": settings.PROVIDER_HUBSPOT_MODE,
            "llm": settings.LLM_PROVIDER,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
