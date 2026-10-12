from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.domain.signals.catalog import (
    ALL_SIGNAL_KEYS,
    MARKETING_SIGNAL_KEYS,
    SIGNAL_CATALOG,
    SignalCategory,
    WEBSITE_SIGNAL_KEYS,
)
from backend.app.domain.signals.evaluators import SignalResult


class QualificationBand(str, Enum):
    DISQUALIFIED = "disqualified"
    REVIEW = "review"
    QUALIFIED = "qualified"


class ScoringEngineConfig(BaseModel):
    version: str = "1.0.0"
    website_weight: float = 0.50
    marketing_weight: float = 0.50
    signal_weights: Dict[str, float] = Field(default_factory=lambda: {
        k: v.default_weight for k, v in SIGNAL_CATALOG.items()
    })
    # Thresholds for qualification bands
    qualified_threshold: float = 65.0
    review_threshold: float = 40.0
    # Ideal-client bonus settings
    ideal_client_bonus_enabled: bool = True
    ideal_client_bonus_points: float = 10.0
    ideal_client_min_website_score: float = 60.0
    ideal_client_min_marketing_score: float = 60.0
    ideal_client_min_coverage_pct: float = 75.0  # At least 75% of signals must be available


class GroupScore(BaseModel):
    category: SignalCategory
    raw_weighted_sum: float
    total_weight: float
    score: float  # 0 - 100
    available_signals_count: int
    total_signals_count: int
    coverage_pct: float


class ScoringExplanationItem(BaseModel):
    signal_key: str
    name: str
    category: str
    available: bool
    normalized_score: float
    weight: float
    weighted_contribution: float
    summary: str


class OverallScoreResult(BaseModel):
    final_score: float  # 0 - 100 clamped
    qualification_band: QualificationBand
    website_group: GroupScore
    marketing_group: GroupScore
    ideal_client_bonus_applied: bool
    ideal_client_bonus_points: float
    signals_evaluated: List[SignalResult]
    explanations: List[ScoringExplanationItem]
    config_version: str
    config_snapshot: Dict[str, Any]


def calculate_group_score(
    category: SignalCategory,
    category_keys: List[str],
    signal_results_map: Dict[str, SignalResult],
    weights: Dict[str, float],
) -> GroupScore:
    total_weight = 0.0
    weighted_sum = 0.0
    available_count = 0

    for key in category_keys:
        result = signal_results_map.get(key)
        if result and result.available:
            weight = weights.get(key, SIGNAL_CATALOG[key].default_weight)
            if weight > 0:
                weighted_sum += result.normalized_score * weight
                total_weight += weight
                available_count += 1

    score = (weighted_sum / total_weight) if total_weight > 0 else 0.0
    score = max(0.0, min(100.0, score))
    total_signals = len(category_keys)
    coverage = (available_count / total_signals * 100.0) if total_signals > 0 else 0.0

    return GroupScore(
        category=category,
        raw_weighted_sum=round(weighted_sum, 2),
        total_weight=round(total_weight, 2),
        score=round(score, 2),
        available_signals_count=available_count,
        total_signals_count=total_signals,
        coverage_pct=round(coverage, 2),
    )


def calculate_overall_score(
    signals: List[SignalResult],
    config: Optional[ScoringEngineConfig] = None,
) -> OverallScoreResult:
    if config is None:
        config = ScoringEngineConfig()

    signal_map = {s.signal_key: s for s in signals}

    # Calculate separate Website & Marketing group scores
    website_group = calculate_group_score(
        category=SignalCategory.WEBSITE,
        category_keys=WEBSITE_SIGNAL_KEYS,
        signal_results_map=signal_map,
        weights=config.signal_weights,
    )

    marketing_group = calculate_group_score(
        category=SignalCategory.MARKETING,
        category_keys=MARKETING_SIGNAL_KEYS,
        signal_results_map=signal_map,
        weights=config.signal_weights,
    )

    # Weighted combination of groups
    total_group_weight = config.website_weight + config.marketing_weight
    if total_group_weight > 0:
        base_score = (
            website_group.score * config.website_weight
            + marketing_group.score * config.marketing_weight
        ) / total_group_weight
    else:
        base_score = 0.0

    # Total evidence coverage
    total_available = website_group.available_signals_count + marketing_group.available_signals_count
    total_possible = website_group.total_signals_count + marketing_group.total_signals_count
    overall_coverage = (total_available / total_possible * 100.0) if total_possible > 0 else 0.0

    # Ideal-client bonus evaluation
    apply_bonus = False
    bonus_points = 0.0
    if config.ideal_client_bonus_enabled:
        if (
            website_group.score >= config.ideal_client_min_website_score
            and marketing_group.score >= config.ideal_client_min_marketing_score
            and overall_coverage >= config.ideal_client_min_coverage_pct
        ):
            apply_bonus = True
            bonus_points = config.ideal_client_bonus_points

    final_score = base_score + bonus_points
    # Clamp strictly to 0 - 100
    final_score = max(0.0, min(100.0, round(final_score, 2)))

    # Determine qualification band
    if final_score >= config.qualified_threshold:
        band = QualificationBand.QUALIFIED
    elif final_score >= config.review_threshold:
        band = QualificationBand.REVIEW
    else:
        band = QualificationBand.DISQUALIFIED

    # Build explainable evidence breakdown
    explanations: List[ScoringExplanationItem] = []
    for key in ALL_SIGNAL_KEYS:
        sig_def = SIGNAL_CATALOG[key]
        sig_res = signal_map.get(key)
        weight = config.signal_weights.get(key, sig_def.default_weight)

        if sig_res and sig_res.available:
            contribution = round(sig_res.normalized_score * weight, 2)
            summary = (
                f"Score {sig_res.normalized_score}/100 (Weight: {weight}). "
                f"Evidence: {sig_res.evidence}"
            )
            available = True
            norm_score = sig_res.normalized_score
        else:
            contribution = 0.0
            summary = "Data unavailable; excluded from weighted calculation without penalty."
            available = False
            norm_score = 0.0

        explanations.append(
            ScoringExplanationItem(
                signal_key=key,
                name=sig_def.name,
                category=sig_def.category.value,
                available=available,
                normalized_score=norm_score,
                weight=weight,
                weighted_contribution=contribution,
                summary=summary,
            )
        )

    return OverallScoreResult(
        final_score=final_score,
        qualification_band=band,
        website_group=website_group,
        marketing_group=marketing_group,
        ideal_client_bonus_applied=apply_bonus,
        ideal_client_bonus_points=bonus_points,
        signals_evaluated=signals,
        explanations=explanations,
        config_version=config.version,
        config_snapshot=config.model_dump(),
    )
