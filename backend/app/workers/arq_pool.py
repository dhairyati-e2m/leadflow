import asyncio
from typing import Optional
from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from backend.app.core.config import settings

_arq_pool: Optional[ArqRedis] = None
_pool_loop: Optional[asyncio.AbstractEventLoop] = None


def get_redis_settings() -> RedisSettings:
    """Builds ARQ RedisSettings from the application configuration."""
    return RedisSettings.from_dsn(settings.REDIS_URL)


async def get_arq_redis_pool() -> ArqRedis:
    """
    Returns an async Redis client pool connected to the ARQ job broker.
    Thread-safe and reused across requests. Automatically recreates pool
    if called from a new or different event loop (e.g. across test functions).
    """
    global _arq_pool, _pool_loop
    current_loop = asyncio.get_running_loop()
    if _arq_pool is None or _pool_loop != current_loop or _pool_loop.is_closed():
        redis_settings = get_redis_settings()
        _arq_pool = await create_pool(redis_settings)
        _pool_loop = current_loop
    return _arq_pool


async def close_arq_redis_pool() -> None:
    """Closes the ARQ Redis client pool cleanly on shutdown."""
    global _arq_pool, _pool_loop
    if _arq_pool is not None:
        try:
            await _arq_pool.close()
        except Exception:
            pass
        _arq_pool = None
        _pool_loop = None
