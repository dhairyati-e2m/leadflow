from typing import Optional
from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from backend.app.core.config import settings

_arq_pool: Optional[ArqRedis] = None


def get_redis_settings() -> RedisSettings:
    """Builds ARQ RedisSettings from the application configuration."""
    return RedisSettings.from_dsn(settings.REDIS_URL)


async def get_arq_redis_pool() -> ArqRedis:
    """
    Returns an async Redis client pool connected to the ARQ job broker.
    Thread-safe and reused across requests.
    """
    global _arq_pool
    if _arq_pool is None:
        redis_settings = get_redis_settings()
        _arq_pool = await create_pool(redis_settings)
    return _arq_pool


async def close_arq_redis_pool() -> None:
    """Closes the ARQ Redis client pool cleanly on shutdown."""
    global _arq_pool
    if _arq_pool is not None:
        await _arq_pool.close()
        _arq_pool = None
