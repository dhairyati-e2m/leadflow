import asyncio
import logging
from typing import Any, Dict, List, Optional

from backend.app.core.database import get_session_factory, set_rls_tenant_context
from backend.app.domain.crawler.service import CrawlerService
from backend.app.domain.scoring_service import ScoringService
from backend.app.repositories.engines import EngineRepository
from backend.app.repositories.enrichments import EnrichmentRepository
from backend.app.repositories.leads import LeadRepository
from backend.app.repositories.runs import RunRepository
from backend.app.repositories.scores import ScoreRepository
from backend.app.repositories.usage import UsageLedgerRepository

logger = logging.getLogger(__name__)


async def process_single_lead_pipeline(
    org_id: str,
    lead_id: str,
    run_id: Optional[str] = None,
    forced_crawl_mode: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes the chained asynchronous lead pipeline: Crawl -> Enrich -> 22-Signal Score.
    Fully isolated by PostgreSQL Row-Level Security via set_rls_tenant_context.
    """
    session_factory = get_session_factory()
    async with session_factory() as session:
        await set_rls_tenant_context(session, org_id)

        lead_repo = LeadRepository(session, org_id)
        enrichment_repo = EnrichmentRepository(session, org_id)
        score_repo = ScoreRepository(session, org_id)
        engine_repo = EngineRepository(session, org_id)
        usage_repo = UsageLedgerRepository(session, org_id)

        lead = await lead_repo.get_by_id(lead_id)
        if not lead:
            return {"status": "not_found", "lead_id": lead_id}

        # Stage 1: Safe Crawl & Evidence Gathering
        crawler_service = CrawlerService(lead_repo, enrichment_repo)
        enrichment = await crawler_service.crawl_lead(lead, forced_mode=forced_crawl_mode)
        await usage_repo.record_usage("pages_crawled", quantity=1)

        # Stage 2: 22-Signal ICP Evaluation
        scoring_service = ScoringService(lead_repo, enrichment_repo, score_repo, engine_repo)
        score_record, score_result = await scoring_service.evaluate_and_score_lead(lead)
        await usage_repo.record_usage("leads_scored", quantity=1)

        await session.commit()

        return {
            "status": "success",
            "lead_id": lead.id,
            "pipeline_state": lead.pipeline_state,
            "final_score": score_result.final_score,
            "qualification_band": score_result.qualification_band.value,
            "enrichment_status": enrichment.status,
            "score_id": score_record.id,
        }


async def process_batch_run_job(
    ctx: Dict[str, Any],
    org_id: str,
    run_id: str,
    lead_ids: List[str],
    forced_crawl_mode: Optional[str] = None,
) -> Dict[str, Any]:
    """
    ARQ background task executing batch processing with state checkpointing,
    cancellation detection, and error logging.
    """
    session_factory = get_session_factory()

    # Initialize run to running status
    async with session_factory() as session:
        await set_rls_tenant_context(session, org_id)
        run_repo = RunRepository(session, org_id)
        run = await run_repo.set_status(run_id, "running")
        if not run:
            return {"status": "run_not_found", "run_id": run_id}
        await session.commit()

    processed_count = 0
    failed_count = 0
    lead_results = []

    try:
        for idx, lead_id in enumerate(lead_ids):
            # Check if run was cancelled by user
            async with session_factory() as session:
                await set_rls_tenant_context(session, org_id)
                run_repo = RunRepository(session, org_id)
                current_run = await run_repo.get_by_id(run_id)
                if current_run and current_run.status == "cancelled":
                    logger.info("Batch run %s cancelled by user at item %d/%d", run_id, idx, len(lead_ids))
                    return {
                        "status": "cancelled",
                        "run_id": run_id,
                        "processed": processed_count,
                        "failed": failed_count,
                    }

            # Process single lead pipeline
            try:
                res = await process_single_lead_pipeline(
                    org_id=org_id,
                    lead_id=lead_id,
                    run_id=run_id,
                    forced_crawl_mode=forced_crawl_mode,
                )
                if res.get("status") == "success":
                    processed_count += 1
                else:
                    failed_count += 1
                lead_results.append(res)
            except Exception as item_err:
                logger.error("Error processing lead %s in run %s: %s", lead_id, run_id, item_err)
                failed_count += 1
                lead_results.append({"status": "error", "lead_id": lead_id, "error": str(item_err)})

            # Update checkpoint in database
            async with session_factory() as session:
                await set_rls_tenant_context(session, org_id)
                run_repo = RunRepository(session, org_id)
                await run_repo.update_progress(
                    run_id=run_id,
                    processed_inc=1 if res.get("status") == "success" else 0,
                    failed_inc=1 if res.get("status") != "success" else 0,
                    checkpoint_data={
                        "current_index": idx + 1,
                        "last_lead_id": lead_id,
                        "completed_percentage": round(((idx + 1) / len(lead_ids)) * 100, 1),
                    },
                )
                await session.commit()

            # Throttling between domain crawls (cooperative yield)
            await asyncio.sleep(0.05)

        # Finalize run status
        final_status = "completed" if failed_count == 0 else "completed_with_errors"
        async with session_factory() as session:
            await set_rls_tenant_context(session, org_id)
            run_repo = RunRepository(session, org_id)
            await run_repo.set_status(
                run_id=run_id,
                status="completed",
                checkpoint_data={
                    "total_items": len(lead_ids),
                    "processed_count": processed_count,
                    "failed_count": failed_count,
                    "completed_percentage": 100.0,
                },
            )
            await session.commit()

        return {
            "status": "completed",
            "run_id": run_id,
            "processed": processed_count,
            "failed": failed_count,
            "total": len(lead_ids),
        }

    except Exception as fatal_err:
        logger.exception("Fatal failure executing batch run %s: %s", run_id, fatal_err)
        async with session_factory() as session:
            await set_rls_tenant_context(session, org_id)
            run_repo = RunRepository(session, org_id)
            await run_repo.set_status(run_id, "failed", error_message=str(fatal_err))
            await session.commit()
        return {"status": "failed", "run_id": run_id, "error": str(fatal_err)}


async def process_lead_pipeline_job(
    ctx: Dict[str, Any],
    org_id: str,
    lead_id: str,
    run_id: Optional[str] = None,
    forced_crawl_mode: Optional[str] = None,
) -> Dict[str, Any]:
    """ARQ background task entrypoint for processing an individual lead."""
    return await process_single_lead_pipeline(
        org_id=org_id,
        lead_id=lead_id,
        run_id=run_id,
        forced_crawl_mode=forced_crawl_mode,
    )
