from typing import Literal, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    APP_NAME: str = "LeadFlow"
    ENVIRONMENT: Literal["development", "testing", "staging", "production"] = "development"
    LOG_LEVEL: str = "info"
    SECRET_KEY: str = Field(
        default="change-this-to-a-secure-random-32-byte-hex-string-in-production",
        description="Secret key for JWT token signing"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Networking
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:3000"

    # Database (PostgreSQL 16 target)
    DATABASE_MIGRATION_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/leadflow",
        description="Privileged database connection for migrations"
    )
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://leadflow_app:leadflow_dev_password@localhost:5432/leadflow",
        description="Standard non-superuser application connection enforcing RLS"
    )
    DATABASE_TEST_URL: str = Field(
        default="postgresql+asyncpg://leadflow_app:leadflow_dev_password@localhost:5432/leadflow_test",
        description="Database URL for automated integration tests"
    )

    # Redis (Redis 7 target)
    REDIS_URL: str = "redis://127.0.0.1:6379/0"

    # Provider Operational Modes
    PROVIDER_ENRICHMENT_MODE: Literal["mock", "live", "disabled"] = "mock"
    PROVIDER_PAGESPEED_MODE: Literal["mock", "live", "disabled"] = "disabled"
    GOOGLE_PAGESPEED_API_KEY: Optional[str] = None
    PROVIDER_HUBSPOT_MODE: Literal["mock", "live", "disabled"] = "disabled"
    HUBSPOT_ACCESS_TOKEN: Optional[str] = None

    # Safe Crawler Boundaries
    CRAWLER_MAX_CONCURRENT: int = 5
    CRAWLER_TIMEOUT_SECONDS: int = 10
    CRAWLER_MAX_PAGES_PER_DOMAIN: int = 3
    CRAWLER_MAX_RESPONSE_BYTES: int = 2 * 1024 * 1024  # 2MB

    # LLM Outreach
    LLM_PROVIDER: Literal["none", "ollama", "openai-compatible"] = "none"
    LLM_BASE_URL: str = "http://localhost:11434/v1"
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: str = "llama3:8b"


settings = Settings()
