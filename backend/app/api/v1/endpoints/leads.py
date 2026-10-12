import math
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session
from backend.app.core.deps import TenantContext, get_tenant_context, require_role
from backend.app.domain.crawler.service import CrawlerService
from backend.app.domain.scoring_service import ScoringService
from backend.app.models.entities import Lead, Score
from backend.app.repositories.engines import EngineRepository
from backend.app.repositories.enrichments import EnrichmentRepository
from backend.app.repositories.leads import LeadRepository
from backend.app.repositories.scores import ScoreRepository

router = APIRouter()


class LeadOut(BaseModel):
    id: str
    org_id: str
    company_name: str
    domain: str
    industry: Optional[str] = None
    location: Optional[str] = None
    employee_count: Optional[str] = None
    pipeline_state: str
    score_band: Optional[str] = None
    latest_score: Optional[float] = None
    created_at: Optional[str] = None


class PaginatedLeadsResponse(BaseModel):
    items: List[LeadOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class EnrichmentSummary(BaseModel):
    id: str
    provider: str
    status: str
    crawled_url: str
    observed_at: Optional[str] = None
    evidence: Dict[str, Any] = Field(default_factory=dict)


class ScoreSummary(BaseModel):
    id: str
    engine_version: str
    final_score: float
    qualification_band: str
    website_group_score: float
    marketing_group_score: float
    ideal_client_bonus_applied: bool
    signal_breakdown: Dict[str, Any] = Field(default_factory=dict)
    config_snapshot: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


class LeadDetailOut(LeadOut):
    latest_enrichment: Optional[EnrichmentSummary] = None
    latest_score_record: Optional[ScoreSummary] = None


class UpdateLeadRequest(BaseModel):
    pipeline_state: Optional[str] = Field(
        None,
        pattern="^(new|enriching|review|qualified|disqualified|approved|rejected|drafted|synced|failed|archived)$",
    )
    company_name: Optional[str] = None


class CrawlLeadResponse(BaseModel):
    lead_id: str
    pipeline_state: str
    enrichment: EnrichmentSummary


def serialize_lead(lead: Lead) -> LeadOut:
    return LeadOut(
        id=lead.id,
        org_id=lead.org_id,
        company_name=lead.company_name,
        domain=lead.domain,
        industry=lead.industry,
        location=lead.location,
        employee_count=lead.employee_count,
        pipeline_state=lead.pipeline_state,
        score_band=lead.score_band,
        latest_score=lead.latest_score,
        created_at=lead.created_at.isoformat() if lead.created_at else None,
    )


def serialize_score(score: Score) -> ScoreSummary:
    return ScoreSummary(
        id=score.id,
        engine_version=score.engine_version,
        final_score=score.final_score,
        qualification_band=score.qualification_band,
        website_group_score=score.website_group_score,
        marketing_group_score=score.marketing_group_score,
        ideal_client_bonus_applied=score.ideal_client_bonus_applied,
        signal_breakdown=score.signal_breakdown or {},
        config_snapshot=score.config_snapshot or {},
        created_at=score.created_at.isoformat() if score.created_at else None,
    )


@router.get(
    "",
    response_model=PaginatedLeadsResponse,
    summary="List leads with tenant isolation, search query, and pipeline state filtering",
)
async def list_leads(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    state: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedLeadsResponse:
    repo = LeadRepository(session, ctx.org_id)
    offset = (page - 1) * page_size
    items, total = await repo.list_paginated(
        pipeline_state=state,
        search_query=search,
        limit=page_size,
        offset=offset,
    )

    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return PaginatedLeadsResponse(
        items=[serialize_lead(l) for l in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/{lead_id}",
    response_model=LeadDetailOut,
    summary="Get lead details along with latest crawl enrichment and 22-signal score evidence",
)
async def get_lead_detail(
    lead_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> LeadDetailOut:
    lead_repo = LeadRepository(session, ctx.org_id)
    enrichment_repo = EnrichmentRepository(session, ctx.org_id)
    score_repo = ScoreRepository(session, ctx.org_id)

    lead = await lead_repo.get_by_id(lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    latest_enrich = await enrichment_repo.get_latest_for_lead(lead.id)
    latest_score_obj = await score_repo.get_latest_for_lead(lead.id)

    enrich_summary = None
    if latest_enrich:
        enrich_summary = EnrichmentSummary(
            id=latest_enrich.id,
            provider=latest_enrich.provider,
            status=latest_enrich.status,
            crawled_url=latest_enrich.crawled_url,
            observed_at=latest_enrich.observed_at.isoformat() if latest_enrich.observed_at else None,
            evidence=latest_enrich.evidence or {},
        )

    score_summary = serialize_score(latest_score_obj) if latest_score_obj else None

    base = serialize_lead(lead)
    return LeadDetailOut(
        **base.model_dump(),
        latest_enrichment=enrich_summary,
        latest_score_record=score_summary,
    )


@router.post(
    "/{lead_id}/crawl",
    response_model=CrawlLeadResponse,
    summary="Safely crawl the lead website with SSRF protection and persist enrichment evidence",
)
async def crawl_lead(
    lead_id: str,
    mode: Optional[str] = Query(default=None, pattern="^(mock|live|disabled)$"),
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst"])),
    session: AsyncSession = Depends(get_db_session),
) -> CrawlLeadResponse:
    lead_repo = LeadRepository(session, ctx.org_id)
    enrichment_repo = EnrichmentRepository(session, ctx.org_id)

    lead = await lead_repo.get_by_id(lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    crawler_service = CrawlerService(lead_repo, enrichment_repo)
    enrichment = await crawler_service.crawl_lead(lead, forced_mode=mode)
    await session.commit()

    return CrawlLeadResponse(
        lead_id=lead.id,
        pipeline_state=lead.pipeline_state,
        enrichment=EnrichmentSummary(
            id=enrichment.id,
            provider=enrichment.provider,
            status=enrichment.status,
            crawled_url=enrichment.crawled_url,
            observed_at=enrichment.observed_at.isoformat() if enrichment.observed_at else None,
            evidence=enrichment.evidence or {},
        ),
    )


@router.post(
    "/{lead_id}/score",
    response_model=ScoreSummary,
    summary="Evaluate lead against 22 qualification signals and active organization ICP criteria",
)
async def score_lead(
    lead_id: str,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst"])),
    session: AsyncSession = Depends(get_db_session),
) -> ScoreSummary:
    lead_repo = LeadRepository(session, ctx.org_id)
    enrichment_repo = EnrichmentRepository(session, ctx.org_id)
    score_repo = ScoreRepository(session, ctx.org_id)
    engine_repo = EngineRepository(session, ctx.org_id)

    lead = await lead_repo.get_by_id(lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    scoring_service = ScoringService(lead_repo, enrichment_repo, score_repo, engine_repo)
    score_record, _ = await scoring_service.evaluate_and_score_lead(lead)
    await session.commit()

    return serialize_score(score_record)


@router.get(
    "/{lead_id}/scores",
    response_model=List[ScoreSummary],
    summary="List history of qualification evaluations for a lead",
)
async def list_lead_scores(
    lead_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> List[ScoreSummary]:
    score_repo = ScoreRepository(session, ctx.org_id)
    scores = await score_repo.list_for_lead(lead_id)
    return [serialize_score(s) for s in scores]


@router.patch(
    "/{lead_id}",
    response_model=LeadOut,
    summary="Update lead state or company properties",
)
async def update_lead(
    lead_id: str,
    data: UpdateLeadRequest,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst", "reviewer"])),
    session: AsyncSession = Depends(get_db_session),
) -> LeadOut:
    lead_repo = LeadRepository(session, ctx.org_id)
    lead = await lead_repo.get_by_id(lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    if data.pipeline_state is not None:
        lead.pipeline_state = data.pipeline_state
    if data.company_name is not None:
        lead.company_name = data.company_name

    await session.commit()
    return serialize_lead(lead)


@router.delete(
    "/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete lead record within organization",
)
async def delete_lead(
    lead_id: str,
    ctx: TenantContext = Depends(require_role(["owner", "admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    lead_repo = LeadRepository(session, ctx.org_id)
    deleted = await lead_repo.delete_by_id(lead_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    await session.commit()
