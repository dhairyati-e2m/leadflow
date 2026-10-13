from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session, get_session_factory, set_rls_tenant_context
from backend.app.core.deps import TenantContext, get_tenant_context, require_role
from backend.app.models.entities import Lead, Run
from backend.app.repositories.runs import RunRepository
from backend.app.repositories.usage import UsageLedgerRepository
from backend.app.workers.arq_pool import get_arq_redis_pool
from backend.app.workers.tasks import process_batch_run_job

router = APIRouter()


class TriggerRunRequest(BaseModel):
    run_type: str = Field(default="enrich_and_score", pattern="^(enrich_and_score|crawl_only|score_only)$")
    search_id: Optional[str] = None
    lead_ids: Optional[List[str]] = None
    forced_crawl_mode: Optional[str] = Field(None, pattern="^(mock|live|disabled)$")
    sync_execution: bool = Field(default=False, description="Run synchronously in-process (useful for immediate responses & tests)")


class RunOut(BaseModel):
    id: str
    org_id: str
    search_id: Optional[str] = None
    run_type: str
    status: str
    total_items: int
    processed_items: int
    failed_items: int
    progress_percentage: float = 0.0
    checkpoint_data: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    created_at: Optional[str] = None


class UsageSummaryOut(BaseModel):
    month_period: str
    metrics: Dict[str, int]


def serialize_run(run: Run) -> RunOut:
    pct = 0.0
    if run.total_items > 0:
        pct = round((run.processed_items / run.total_items) * 100.0, 1)

    return RunOut(
        id=run.id,
        org_id=run.org_id,
        search_id=run.search_id,
        run_type=run.run_type,
        status=run.status,
        total_items=run.total_items,
        processed_items=run.processed_items,
        failed_items=run.failed_items,
        progress_percentage=pct,
        checkpoint_data=run.checkpoint_data or {},
        error_message=run.error_message,
        created_at=run.created_at.isoformat() if run.created_at else None,
    )


@router.post(
    "/runs",
    response_model=RunOut,
    status_code=status.HTTP_201_CREATED,
    summary="Enqueue a batch crawl and qualification run in the background via ARQ and Redis",
)
async def trigger_batch_run(
    data: TriggerRunRequest,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst"])),
    session: AsyncSession = Depends(get_db_session),
) -> RunOut:
    lead_stmt = select(Lead.id).where(Lead.org_id == ctx.org_id)

    if data.lead_ids:
        lead_stmt = lead_stmt.where(Lead.id.in_(data.lead_ids))
    elif data.search_id:
        lead_stmt = lead_stmt.where(Lead.search_id == data.search_id)
    else:
        # Default: select all leads in 'new' state awaiting qualification
        lead_stmt = lead_stmt.where(Lead.pipeline_state == "new")

    lead_ids_res = await session.execute(lead_stmt)
    target_ids = list(lead_ids_res.scalars().all())

    if not target_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No eligible leads found for this run criteria.",
        )

    run_repo = RunRepository(session, ctx.org_id)
    run = await run_repo.create_run(
        run_type=data.run_type,
        total_items=len(target_ids),
        search_id=data.search_id,
        checkpoint_data={"target_lead_ids": target_ids},
    )
    run_id = run.id
    await session.commit()

    if data.sync_execution:
        # Direct execution (useful for integration tests & synchronous execution modes)
        await process_batch_run_job(
            ctx={},
            org_id=ctx.org_id,
            run_id=run_id,
            lead_ids=target_ids,
            forced_crawl_mode=data.forced_crawl_mode,
        )
        # Fetch freshly committed run record in clean session
        session_factory = get_session_factory()
        async with session_factory() as fresh_session:
            await set_rls_tenant_context(fresh_session, ctx.org_id)
            fresh_repo = RunRepository(fresh_session, ctx.org_id)
            fresh_run = await fresh_repo.get_by_id(run_id)
            if fresh_run:
                return serialize_run(fresh_run)
    else:
        # Enqueue background job to Redis via ARQ broker
        try:
            arq_pool = await get_arq_redis_pool()
            await arq_pool.enqueue_job(
                "process_batch_run_job",
                ctx.org_id,
                run.id,
                target_ids,
                data.forced_crawl_mode,
            )
        except Exception as redis_err:
            # If Redis connection fails, record error on run
            await run_repo.set_status(run.id, "failed", error_message=f"Failed to enqueue to Redis ARQ queue: {str(redis_err)}")
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Background job broker unavailable: {str(redis_err)}",
            )

    return serialize_run(run)


@router.get(
    "/runs",
    response_model=List[RunOut],
    summary="List past background qualification runs for the organization",
)
async def list_runs(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> List[RunOut]:
    run_repo = RunRepository(session, ctx.org_id)
    runs = await run_repo.list_runs(limit=50)
    return [serialize_run(r) for r in runs]


@router.get(
    "/runs/{run_id}",
    response_model=RunOut,
    summary="Get live status and checkpoint progress of a background run",
)
async def get_run_status(
    run_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> RunOut:
    run_repo = RunRepository(session, ctx.org_id)
    run = await run_repo.get_by_id(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return serialize_run(run)


@router.post(
    "/runs/{run_id}/cancel",
    response_model=RunOut,
    summary="Cancel an active background qualification run",
)
async def cancel_run(
    run_id: str,
    ctx: TenantContext = Depends(require_role(["owner", "admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> RunOut:
    run_repo = RunRepository(session, ctx.org_id)
    run = await run_repo.get_by_id(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")

    if run.status in ("completed", "failed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Run cannot be cancelled because it is already in '{run.status}' state.",
        )

    updated = await run_repo.set_status(run_id, "cancelled")
    await session.commit()
    return serialize_run(updated)


@router.get(
    "/usage",
    response_model=UsageSummaryOut,
    summary="Get monthly resource usage and ledger metrics for tenant",
)
async def get_usage_summary(
    period: Optional[str] = Query(default=None, pattern="^\\d{4}-\\d{2}$"),
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> UsageSummaryOut:
    from datetime import datetime, timezone
    active_period = period or datetime.now(timezone.utc).strftime("%Y-%m")
    usage_repo = UsageLedgerRepository(session, ctx.org_id)
    metrics = await usage_repo.get_monthly_summary(active_period)
    return UsageSummaryOut(month_period=active_period, metrics=metrics)
