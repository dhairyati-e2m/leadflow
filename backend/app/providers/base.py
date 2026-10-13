from abc import ABC, abstractmethod
from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field


class ProviderResult(BaseModel):
    provider_key: str
    status: Literal["success", "mock", "fallback", "disabled", "error"]
    data: Dict[str, Any] = Field(default_factory=dict)
    quota_consumed: int = 0
    quota_remaining: Optional[int] = None
    error_message: Optional[str] = None


class BaseProvider(ABC):
    def __init__(self, key: str, name: str, mode: Literal["mock", "live", "disabled"] = "disabled"):
        self.key = key
        self.name = name
        self.mode = mode

    @abstractmethod
    async def execute(self, target: str, **kwargs: Any) -> ProviderResult:
        """Execute the provider against target (e.g. URL, domain) adhering to configured mode."""
        pass

    @abstractmethod
    def get_quota_info(self) -> Dict[str, Any]:
        """Return free tier quota metrics, thresholds, and limits."""
        pass
