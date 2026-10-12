from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session
from backend.app.core.deps import TenantContext, get_tenant_context, require_role
from backend.app.domain.scoring import (
    OverallScoreResult,
    ScoringEngineConfig,
    calculate_overall_score,
)
from backend.app.domain.signals.catalog import ALL_SIGNAL_KEYS, SIGNAL_CATALOG
from backend.app.domain.signals.evaluators import (
    CrawlData,
    SignalResult,
    evaluate_all_signals,
)
from backend.app.repositories.engines import EngineRepository

router = APIRouter()


class ScoreEvaluationRequest(BaseModel):
    url: str
    html: Optional[str] = None
    load_time_ms: Optional[float] = 1200.0
    ssl_valid: Optional[bool] = True
    external_data: Dict[str, Any] = Field(default_factory=dict)
    config: Optional[ScoringEngineConfig] = None


@router.get("/signals", summary="Catalog of 22 Qualification Signals")
def get_signal_catalog() -> Dict[str, Any]:
    """Returns the full product specification catalog of 22 signals with categories and default weights."""
    return {
        "total_signals": len(SIGNAL_CATALOG),
        "signals": [
            {
                "key": s.key,
                "category": s.category.value,
                "name": s.name,
                "description": s.description,
                "default_weight": s.default_weight,
            }
            for s in SIGNAL_CATALOG.values()
        ],
    }


@router.get(
    "/config",
    response_model=ScoringEngineConfig,
    summary="Get Organization ICP Scoring Configuration and Weights",
)
async def get_scoring_config(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> ScoringEngineConfig:
    engine_repo = EngineRepository(session, ctx.org_id)
    return await engine_repo.get_or_create_config()


@router.put(
    "/config",
    response_model=ScoringEngineConfig,
    summary="Update Organization ICP Scoring Configuration and Weights",
)
async def update_scoring_config(
    new_config: ScoringEngineConfig,
    ctx: TenantContext = Depends(require_role(["owner", "admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> ScoringEngineConfig:
    engine_repo = EngineRepository(session, ctx.org_id)
    updated = await engine_repo.update_config(new_config)
    await session.commit()
    return updated


@router.post(
    "/evaluate",
    response_model=OverallScoreResult,
    summary="Evaluate 22 Signals and Calculate Score (Sandbox / On-The-Fly)",
)
def evaluate_prospect(request: ScoreEvaluationRequest) -> OverallScoreResult:
    """
    Evaluates a prospect website against all 22 deterministic signals,
    calculates Website & Marketing group scores, applies ideal-client bonus if eligible,
    and returns a fully explainable qualification result.
    """
    crawl = CrawlData(
        url=request.url,
        status_code=200,
        headers={"content-type": "text/html; charset=utf-8"},
        html=request.html or "<html><head><title>Company Home</title></head><body><h1>Welcome</h1></body></html>",
        load_time_ms=request.load_time_ms,
        ssl_valid=request.ssl_valid,
        external_data=request.external_data,
    )

    signals = evaluate_all_signals(crawl)
    return calculate_overall_score(signals=signals, config=request.config)
