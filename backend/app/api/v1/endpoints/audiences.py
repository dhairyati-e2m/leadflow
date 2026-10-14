from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session
from backend.app.core.deps import TenantContext, get_tenant_context, require_role
from backend.app.models.entities import Audience, AuditLog

router = APIRouter()

# ------------------------------------------------------------------------------
# 8.1 Filter Catalog: Single Source of Truth for Verticals, Locations, and Rules
# ------------------------------------------------------------------------------
FILTER_CATALOG = {
    "verticals": [
        "B2B SaaS & Enterprise Software",
        "Healthcare & Medical Devices",
        "E-Commerce & Digital Brands",
        "Professional & IT Services",
        "Financial Services & FinTech",
        "Commercial Real Estate & PropTech",
        "Advanced Manufacturing & Logistics",
        "Legal & Regulatory Compliance",
        "Hospitality & High-Growth Leisure",
        "Education & EdTech Solutions",
    ],
    "locations": [
        "United States (Nationwide)",
        "Canada (All Provinces)",
        "United Kingdom (UK)",
        "European Union (EU)",
        "San Francisco Bay Area, CA",
        "New York Metro, NY",
        "Austin, TX",
        "Chicago, IL",
        "Seattle, WA",
        "Boston, MA",
        "London, UK",
        "Toronto, ON",
    ],
    "headcount_ranges": [
        "1-10 employees",
        "11-50 employees",
        "51-200 employees",
        "201-500 employees",
        "501-1,000 employees",
        "1,000+ enterprise",
    ],
    "match_operators": ["or", "and"],
}


class AudienceFilters(BaseModel):
    verticals: List[str] = Field(default_factory=lambda: ["B2B SaaS & Enterprise Software"])
    vertical_match: str = Field(default="or", pattern="^(or|and)$")  # or = wider pool, and = narrower pool
    locations: List[str] = Field(default_factory=lambda: ["United States (Nationwide)"])
    location_match: str = Field(default="or", pattern="^(or|and)$")
    headcount_ranges: List[str] = Field(default_factory=lambda: ["11-50 employees", "51-200 employees"])
    exclude_locations: List[str] = Field(default_factory=list)
    exclude_verticals: List[str] = Field(default_factory=list)
    exclude_domains: List[str] = Field(default_factory=list)
    exclude_existing_crm: bool = Field(default=True, description="Prefer skipping contacts already in HubSpot")
    negative_keywords: List[str] = Field(default_factory=list)


class AudienceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: Optional[str] = None
    filters: AudienceFilters
    is_default: bool = False


class AudienceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    filters: Optional[AudienceFilters] = None
    is_default: Optional[bool] = None


class AudienceOut(BaseModel):
    id: str
    org_id: str
    name: str
    description: Optional[str] = None
    filters: Dict[str, Any]
    is_default: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class AIProposeRequest(BaseModel):
    brief_text: str = Field(min_length=10, description="Client ideal-customer brief or extracted document text")


class AIProposeResponse(BaseModel):
    filters: AudienceFilters
    rationale: str
    estimated_pool_depth: str
    suggested_name: str


@router.get("/filter-catalog", summary="Get Canonical Filter Catalog (Section 8.1)")
def get_filter_catalog() -> Dict[str, Any]:
    """Single source of truth for UI, AI propose, and payload mapping"""
    return FILTER_CATALOG


@router.get("", response_model=List[AudienceOut], summary="List ICP Audiences for Organization")
async def list_audiences(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> List[AudienceOut]:
    stmt = (
        select(Audience)
        .where(Audience.org_id == ctx.org_id)
        .order_by(Audience.is_default.desc(), Audience.created_at.desc())
    )
    result = await session.execute(stmt)
    audiences = result.scalars().all()

    # If no audiences exist yet, create a default baseline ICP
    if not audiences:
        default_filters = AudienceFilters().model_dump()
        default_audience = Audience(
            org_id=ctx.org_id,
            name="Primary B2B Growth ICP",
            description="Default ideal customer profile targeting mid-market B2B software and tech-enabled services.",
            filters=default_filters,
            is_default=True,
        )
        session.add(default_audience)
        await session.commit()
        audiences = [default_audience]

    return [
        AudienceOut(
            id=a.id,
            org_id=a.org_id,
            name=a.name,
            description=a.description,
            filters=a.filters,
            is_default=a.is_default,
            created_at=a.created_at.isoformat() if a.created_at else None,
            updated_at=a.updated_at.isoformat() if a.updated_at else None,
        )
        for a in audiences
    ]


@router.get("/{audience_id}", response_model=AudienceOut, summary="Get Single ICP Audience")
async def get_audience(
    audience_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> AudienceOut:
    stmt = select(Audience).where(Audience.id == audience_id, Audience.org_id == ctx.org_id)
    audience = (await session.execute(stmt)).scalars().first()
    if not audience:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ICP Audience not found")

    return AudienceOut(
        id=audience.id,
        org_id=audience.org_id,
        name=audience.name,
        description=audience.description,
        filters=audience.filters,
        is_default=audience.is_default,
        created_at=audience.created_at.isoformat() if audience.created_at else None,
        updated_at=audience.updated_at.isoformat() if audience.updated_at else None,
    )


@router.post("", response_model=AudienceOut, status_code=status.HTTP_201_CREATED, summary="Create ICP Audience")
async def create_audience(
    data: AudienceCreate,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "org_admin", "super_admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> AudienceOut:
    if data.is_default:
        # Reset previous default
        prev_defaults = await session.execute(
            select(Audience).where(Audience.org_id == ctx.org_id, Audience.is_default == True)
        )
        for aud in prev_defaults.scalars().all():
            aud.is_default = False

    audience = Audience(
        org_id=ctx.org_id,
        name=data.name,
        description=data.description,
        filters=data.filters.model_dump(),
        is_default=data.is_default,
    )
    session.add(audience)

    # Log audit entry
    audit = AuditLog(
        org_id=ctx.org_id,
        user_id=ctx.user.id,
        action="create_audience",
        entity_type="audience",
        entity_id=audience.id,
        details={"name": data.name, "is_default": data.is_default},
    )
    session.add(audit)
    await session.commit()

    return AudienceOut(
        id=audience.id,
        org_id=audience.org_id,
        name=audience.name,
        description=audience.description,
        filters=audience.filters,
        is_default=audience.is_default,
        created_at=audience.created_at.isoformat() if audience.created_at else None,
        updated_at=audience.updated_at.isoformat() if audience.updated_at else None,
    )


@router.put("/{audience_id}", response_model=AudienceOut, summary="Update ICP Audience")
async def update_audience(
    audience_id: str,
    data: AudienceUpdate,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "org_admin", "super_admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> AudienceOut:
    stmt = select(Audience).where(Audience.id == audience_id, Audience.org_id == ctx.org_id)
    audience = (await session.execute(stmt)).scalars().first()
    if not audience:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ICP Audience not found")

    if data.name is not None:
        audience.name = data.name
    if data.description is not None:
        audience.description = data.description
    if data.filters is not None:
        audience.filters = data.filters.model_dump()
    if data.is_default is True:
        # Demote existing defaults
        prev_defaults = await session.execute(
            select(Audience).where(
                Audience.org_id == ctx.org_id,
                Audience.id != audience_id,
                Audience.is_default == True,
            )
        )
        for aud in prev_defaults.scalars().all():
            aud.is_default = False
        audience.is_default = True
    elif data.is_default is False:
        audience.is_default = False

    # Log audit entry
    audit = AuditLog(
        org_id=ctx.org_id,
        user_id=ctx.user.id,
        action="update_audience",
        entity_type="audience",
        entity_id=audience.id,
        details={"name": audience.name, "updated_fields": [k for k, v in data.model_dump(exclude_unset=True).items()]},
    )
    session.add(audit)
    await session.commit()

    return AudienceOut(
        id=audience.id,
        org_id=audience.org_id,
        name=audience.name,
        description=audience.description,
        filters=audience.filters,
        is_default=audience.is_default,
        created_at=audience.created_at.isoformat() if audience.created_at else None,
        updated_at=audience.updated_at.isoformat() if audience.updated_at else None,
    )


@router.post("/ai-propose", response_model=AIProposeResponse, summary="Propose ICP Filters from Client Brief (Section 8.2)")
def ai_propose_icp(request: AIProposeRequest) -> AIProposeResponse:
    """
    Analyzes strategist brief or document text to propose structured ICP filters.
    Operates with zero external API calls (zero credit spend) via deterministic semantic heuristics.
    """
    text = request.brief_text.lower()

    # Detect matching verticals
    detected_verticals = []
    if any(k in text for k in ["saas", "software", "tech", "platform", "cloud", "api"]):
        detected_verticals.append("B2B SaaS & Enterprise Software")
    if any(k in text for k in ["health", "medical", "clinic", "biotech", "care"]):
        detected_verticals.append("Healthcare & Medical Devices")
    if any(k in text for k in ["ecommerce", "retail", "dtc", "shop", "consumer", "brand"]):
        detected_verticals.append("E-Commerce & Digital Brands")
    if any(k in text for k in ["consulting", "agency", "it services", "managed", "advisory"]):
        detected_verticals.append("Professional & IT Services")
    if any(k in text for k in ["finance", "fintech", "banking", "wealth", "insurance", "capital"]):
        detected_verticals.append("Financial Services & FinTech")
    if any(k in text for k in ["real estate", "property", "brokerage", "tenant", "development"]):
        detected_verticals.append("Commercial Real Estate & PropTech")
    if any(k in text for k in ["manufacturing", "factory", "industrial", "supply chain", "logistics"]):
        detected_verticals.append("Advanced Manufacturing & Logistics")
    if any(k in text for k in ["legal", "law", "attorney", "compliance"]):
        detected_verticals.append("Legal & Regulatory Compliance")

    if not detected_verticals:
        detected_verticals = ["B2B SaaS & Enterprise Software", "Professional & IT Services"]

    # Detect matching locations
    detected_locations = []
    if any(k in text for k in ["us", "usa", "united states", "nationwide", "north america"]):
        detected_locations.append("United States (Nationwide)")
    if any(k in text for k in ["california", "san francisco", "sf", "silicon valley"]):
        detected_locations.append("San Francisco Bay Area, CA")
    if any(k in text for k in ["new york", "nyc", "manhattan"]):
        detected_locations.append("New York Metro, NY")
    if any(k in text for k in ["austin", "texas"]):
        detected_locations.append("Austin, TX")
    if any(k in text for k in ["chicago", "midwest"]):
        detected_locations.append("Chicago, IL")
    if any(k in text for k in ["uk", "london", "britain"]):
        detected_locations.append("United Kingdom (UK)")
    if any(k in text for k in ["canada", "toronto"]):
        detected_locations.append("Canada (All Provinces)")

    if not detected_locations:
        detected_locations = ["United States (Nationwide)"]

    # Detect headcount ranges
    detected_headcounts = []
    if any(k in text for k in ["startup", "early stage", "seed", "small team", "<20"]):
        detected_headcounts.append("1-10 employees")
        detected_headcounts.append("11-50 employees")
    if any(k in text for k in ["mid-market", "growth", "scaling", "series a", "series b", "50-", "100"]):
        detected_headcounts.append("11-50 employees")
        detected_headcounts.append("51-200 employees")
    if any(k in text for k in ["enterprise", "corporate", "large", "500+", "1000+"]):
        detected_headcounts.append("201-500 employees")
        detected_headcounts.append("501-1,000 employees")

    if not detected_headcounts:
        detected_headcounts = ["11-50 employees", "51-200 employees"]

    # Exclusions
    exclude_locs = []
    if "exclude california" in text or "no ca" in text:
        exclude_locs.append("San Francisco Bay Area, CA")

    filters = AudienceFilters(
        verticals=detected_verticals,
        vertical_match="or",  # default OR = wider pool
        locations=detected_locations,
        location_match="or",
        headcount_ranges=list(set(detected_headcounts)),
        exclude_locations=exclude_locs,
        exclude_verticals=[],
        exclude_domains=[],
        exclude_existing_crm=True,
        negative_keywords=["crypto", "gambling", "adult"] if "b2b" in text else [],
    )

    return AIProposeResponse(
        filters=filters,
        suggested_name=f"Proposed ICP: {detected_verticals[0].split('&')[0].strip()} ({filters.locations[0].split('(')[0].strip()})",
        rationale=(
            f"Extracted intent for {len(detected_verticals)} vertical(s) using OR matching to maximize sourcing depth. "
            f"Targeting {', '.join(detected_locations)} with headcount bounds {', '.join(detected_headcounts)}. "
            f"Automatic exclusion of existing HubSpot CRM records enabled to prevent duplicate outreach."
        ),
        estimated_pool_depth="~450-1,200 eligible target prospects in active geography",
    )
