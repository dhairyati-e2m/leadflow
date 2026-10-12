from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.domain.scoring import (
    OverallScoreResult,
    ScoringEngineConfig,
    calculate_overall_score,
)
from backend.app.domain.signals.catalog import SIGNAL_CATALOG, ALL_SIGNAL_KEYS
from backend.app.domain.signals.evaluators import (
    CrawlData,
    SignalResult,
    evaluate_all_signals,
)

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


@router.post("/evaluate", response_model=OverallScoreResult, summary="Evaluate 22 Signals and Calculate Score")
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
