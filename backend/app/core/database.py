from typing import AsyncGenerator, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.app.core.config import settings

_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def get_database_url() -> str:
    """
    Returns appropriate database connection string.
    In testing environment when PostgreSQL is unavailable, uses SQLite in-memory for unit testing.
    Production and development strictly target PostgreSQL 16.
    """
    if settings.ENVIRONMENT == "testing":
        url = settings.DATABASE_TEST_URL
        # If testing URL is PostgreSQL, verify if driver can be loaded; fallback to SQLite for offline test suites
        if "postgresql" in url:
            try:
                import asyncpg  # noqa: F401
            except Exception:
                return "sqlite+aiosqlite:///:memory:"
        return url
    return settings.DATABASE_URL


from sqlalchemy.pool import NullPool

def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        db_url = get_database_url()
        connect_args = {}
        pool_kwargs = {}
        if settings.ENVIRONMENT == "testing":
            pool_kwargs["poolclass"] = NullPool
        else:
            pool_kwargs["pool_size"] = 10
            pool_kwargs["max_overflow"] = 20

        if "sqlite" in db_url:
            connect_args = {"check_same_thread": False}

        _engine = create_async_engine(
            db_url,
            echo=False,
            connect_args=connect_args,
            **pool_kwargs,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _session_factory


async def set_rls_tenant_context(session: AsyncSession, org_id: str) -> None:
    """
    Sets transaction-local tenant context for PostgreSQL Row-Level Security (RLS).
    Executes 'SET LOCAL app.current_org_id = :org_id'.
    Parameterized and safe against SQL injection.
    Gracefully skips on SQLite during offline unit tests.
    """
    bind = session.bind
    if bind and bind.dialect.name == "postgresql":
        await session.execute(
            text("SELECT set_config('app.current_org_id', :org_id, true)"),
            {"org_id": org_id},
        )


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a managed async database session."""
    session_maker = get_session_factory()
    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
