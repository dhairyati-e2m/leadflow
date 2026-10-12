import pytest
from backend.app.domain.scoring import (
    OverallScoreResult,
    QualificationBand,
    ScoringEngineConfig,
    calculate_overall_score,
)
from backend.app.domain.signals.catalog import ALL_SIGNAL_KEYS, WEBSITE_SIGNAL_KEYS, MARKETING_SIGNAL_KEYS
from backend.app.domain.signals.evaluators import SignalResult


def test_scoring_boundary_normalization():
    """Verify that group and overall scores strictly clamp between 0.0 and 100.0."""
    signals = [
        SignalResult(signal_key=k, available=True, normalized_score=100.0, weight=1.0)
        for k in ALL_SIGNAL_KEYS
    ]
    result = calculate_overall_score(signals)
    assert result.final_score <= 100.0
    assert result.website_group.score == 100.0
    assert result.marketing_group.score == 100.0
    assert result.qualification_band == QualificationBand.QUALIFIED


def test_scoring_with_missing_signals_does_not_penalize():
    """Missing signals must produce available: false and must NOT reduce the weighted average of available signals."""
    # Create signals where only 2 website signals are available, both scoring 80.0
    signals = [
        SignalResult(signal_key=WEBSITE_SIGNAL_KEYS[0], available=True, normalized_score=80.0, weight=1.0),
        SignalResult(signal_key=WEBSITE_SIGNAL_KEYS[1], available=True, normalized_score=80.0, weight=1.0),
    ]
    # Rest are unavailable
    for k in ALL_SIGNAL_KEYS:
        if k not in [WEBSITE_SIGNAL_KEYS[0], WEBSITE_SIGNAL_KEYS[1]]:
            signals.append(SignalResult(signal_key=k, available=False, normalized_score=0.0, weight=1.0))

    config = ScoringEngineConfig(website_weight=1.0, marketing_weight=0.0, ideal_client_bonus_enabled=False)
    result = calculate_overall_score(signals, config)

    # Website group score should be 80.0 (average of available signals), NOT diluted by missing signals!
    assert result.website_group.score == 80.0
    assert result.website_group.available_signals_count == 2
    assert result.final_score == 80.0


def test_ideal_client_bonus_logic():
    """Ideal client bonus is awarded only when minimum group scores and minimum coverage are met."""
    # When scores are high and all 22 signals are present
    signals = [
        SignalResult(signal_key=k, available=True, normalized_score=70.0, weight=1.0)
        for k in ALL_SIGNAL_KEYS
    ]
    config = ScoringEngineConfig(
        ideal_client_bonus_enabled=True,
        ideal_client_bonus_points=10.0,
        ideal_client_min_website_score=60.0,
        ideal_client_min_marketing_score=60.0,
        ideal_client_min_coverage_pct=75.0,
    )
    result = calculate_overall_score(signals, config)
    assert result.ideal_client_bonus_applied is True
    assert result.ideal_client_bonus_points == 10.0
    assert result.final_score == 80.0  # 70.0 base + 10.0 bonus


def test_qualification_band_thresholds():
    """Verify band classification: disqualified, review, qualified."""
    config = ScoringEngineConfig(
        qualified_threshold=65.0,
        review_threshold=40.0,
        ideal_client_bonus_enabled=False,
    )

    # Disqualified case
    signals_low = [
        SignalResult(signal_key=k, available=True, normalized_score=30.0, weight=1.0)
        for k in ALL_SIGNAL_KEYS
    ]
    assert calculate_overall_score(signals_low, config).qualification_band == QualificationBand.DISQUALIFIED

    # Review case
    signals_mid = [
        SignalResult(signal_key=k, available=True, normalized_score=50.0, weight=1.0)
        for k in ALL_SIGNAL_KEYS
    ]
    assert calculate_overall_score(signals_mid, config).qualification_band == QualificationBand.REVIEW

    # Qualified case
    signals_high = [
        SignalResult(signal_key=k, available=True, normalized_score=85.0, weight=1.0)
        for k in ALL_SIGNAL_KEYS
    ]
    assert calculate_overall_score(signals_high, config).qualification_band == QualificationBand.QUALIFIED
