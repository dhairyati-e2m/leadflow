from typing import Any, Dict, List, Optional, Tuple

from backend.app.domain.scoring import (
    OverallScoreResult,
    QualificationBand,
    ScoringEngineConfig,
    calculate_overall_score,
)
from backend.app.domain.signals.evaluators import CrawlData, evaluate_all_signals
from backend.app.models.entities import Lead, Score
from backend.app.repositories.engines import EngineRepository
from backend.app.repositories.enrichments import EnrichmentRepository
from backend.app.repositories.leads import LeadRepository
from backend.app.repositories.scores import ScoreRepository


class ScoringService:
    def __init__(
        self,
        lead_repo: LeadRepository,
        enrichment_repo: EnrichmentRepository,
        score_repo: ScoreRepository,
        engine_repo: EngineRepository,
    ):
        self.lead_repo = lead_repo
        self.enrichment_repo = enrichment_repo
        self.score_repo = score_repo
        self.engine_repo = engine_repo

    async def evaluate_and_score_lead(
        self,
        lead: Lead,
        custom_config: Optional[ScoringEngineConfig] = None,
    ) -> Tuple[Score, OverallScoreResult]:
        """
        Executes the 22-signal deterministic evaluation against a lead's crawl evidence,
        computes normalized category scores and Ideal Customer Profile (ICP) bonuses,
        persists the explainable score audit snapshot, and advances lead qualification state.
        """
        # Retrieve latest crawl evidence
        latest_enrichment = await self.enrichment_repo.get_latest_for_lead(lead.id)

        if latest_enrichment and latest_enrichment.evidence:
            ev = latest_enrichment.evidence
            crawl_data = CrawlData(
                url=latest_enrichment.crawled_url,
                status_code=ev.get("status_code", 200),
                headers=ev.get("headers", {}),
                html=ev.get("html", ""),
                load_time_ms=ev.get("load_time_ms", 1200.0),
                ssl_valid=ev.get("ssl_valid", True),
                external_data=ev,
            )
        else:
            # Fallback for leads that haven't completed crawl
            crawl_data = CrawlData(
                url=f"https://{lead.domain}",
                status_code=200,
                headers={},
                html="<html><head><title>Uncrawled</title></head><body></body></html>",
                load_time_ms=1500.0,
                ssl_valid=True,
                external_data={},
            )

        # 1. Run all 22 deterministic signals
        signals = evaluate_all_signals(crawl_data)

        # 2. Retrieve organization's active ICP scoring configuration
        config = custom_config or await self.engine_repo.get_or_create_config()

        # 3. Calculate overall weighted score with explainability items
        result = calculate_overall_score(signals=signals, config=config)

        # 4. Prepare JSON-serializable evidence breakdown
        breakdown_payload = {
            "signals": [s.model_dump(mode="json") for s in result.signals_evaluated],
            "explanations": [e.model_dump(mode="json") for e in result.explanations],
            "website_group": result.website_group.model_dump(mode="json"),
            "marketing_group": result.marketing_group.model_dump(mode="json"),
            "ideal_client_bonus_applied": result.ideal_client_bonus_applied,
            "ideal_client_bonus_points": result.ideal_client_bonus_points,
        }

        # 5. Persist versioned Score snapshot in PostgreSQL
        score_record = await self.score_repo.create_score(
            lead_id=lead.id,
            engine_version=config.version,
            final_score=result.final_score,
            qualification_band=result.qualification_band.value,
            website_group_score=result.website_group.score,
            marketing_group_score=result.marketing_group.score,
            ideal_client_bonus_applied=result.ideal_client_bonus_applied,
            signal_breakdown=breakdown_payload,
            config_snapshot=config.model_dump(mode="json"),
        )

        # 6. Update Lead entity state and score attributes
        lead.latest_score = result.final_score
        lead.score_band = result.qualification_band.value

        if result.qualification_band == QualificationBand.QUALIFIED:
            lead.pipeline_state = "qualified"
        elif result.qualification_band == QualificationBand.DISQUALIFIED:
            lead.pipeline_state = "rejected"
        else:
            lead.pipeline_state = "review"

        await self.lead_repo.session.flush()

        return score_record, result
