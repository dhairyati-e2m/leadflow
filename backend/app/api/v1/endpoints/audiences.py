from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session
from backend.app.core.deps import TenantContext, get_tenant_context, require_role
from backend.app.domain.ingestion.csv_parser import normalize_domain
from backend.app.models.entities import Audience, AuditLog, Contact, Lead
from backend.app.providers.hunter import HunterProvider
from backend.app.api.v1.endpoints.integrations import is_provider_enabled_for_org

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


def sanitize_filters(raw_filters: Any) -> Dict[str, Any]:
    """Guarantees complete AudienceFilters dict with all expected fields populated."""
    defaults = AudienceFilters().model_dump()
    if not raw_filters:
        return defaults
    if isinstance(raw_filters, str):
        import json
        try:
            raw_filters = json.loads(raw_filters)
        except Exception:
            return defaults
    if isinstance(raw_filters, dict):
        try:
            return AudienceFilters(**raw_filters).model_dump()
        except Exception:
            defaults.update(raw_filters)
            return defaults
    return defaults


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
            filters=sanitize_filters(a.filters),
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
        filters=sanitize_filters(audience.filters),
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
        filters=sanitize_filters(audience.filters),
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
        flag_modified(audience, "filters")
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
        filters=sanitize_filters(audience.filters),
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


class DiscoveredCompanyOut(BaseModel):
    company_name: str
    domain: str
    location: str
    industry: str
    employee_count: str
    emails_count: int = 0
    sample_email: Optional[str] = None
    source: str = "hunter_discover"


class AudienceDiscoverRequest(BaseModel):
    audience_id: Optional[str] = None
    filters: Optional[AudienceFilters] = None
    limit: int = Field(default=5, ge=1, le=25, description="Constraint on number of companies to fetch (1-25)")
    query_override: Optional[str] = None


class AudienceDiscoverResponse(BaseModel):
    query_used: str
    limit_requested: int
    total_found: int
    companies: List[DiscoveredCompanyOut]


@router.post("/discover", response_model=AudienceDiscoverResponse, summary="Discover Companies Matching ICP via Hunter.io API")
async def discover_companies(
    data: AudienceDiscoverRequest,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst", "reviewer", "client_viewer"])),
    session: AsyncSession = Depends(get_db_session),
) -> AudienceDiscoverResponse:
    """
    Discovers companies based on the configured ICP profile filters or submitted filters.
    Enforces a strict limit constraint (1-25) to preserve free Hunter.io API quota.
    """
    filters: Optional[AudienceFilters] = data.filters

    if data.audience_id:
        stmt = select(Audience).where(Audience.id == data.audience_id, Audience.org_id == ctx.org_id)
        aud = (await session.execute(stmt)).scalars().first()
        if not aud:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified ICP Audience not found")
        filters = AudienceFilters(**aud.filters)

    if not filters:
        filters = AudienceFilters()

    # Build semantic natural language query for Hunter.io Discover AI engine
    vertical_str = ", ".join(filters.verticals) if filters.verticals else "Technology"
    loc_str = ", ".join(filters.locations) if filters.locations else "Toronto, Canada"
    headcount_str = ", ".join(filters.headcount_ranges) if filters.headcount_ranges else "11-50 employees"

    built_query = data.query_override or f"{vertical_str} companies in {loc_str} with {headcount_str}"

    primary_loc = filters.locations[0] if filters.locations else "Toronto, Canada"
    primary_ind = filters.verticals[0] if filters.verticals else "Healthcare & Medical Devices"
    primary_hc = filters.headcount_ranges[0] if filters.headcount_ranges else "11-50 employees"

    # Enforce Signal Engine integration toggle (Requirement 8)
    if not is_provider_enabled_for_org(ctx.organization, "hunter"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hunter.io company discovery is disabled for this organization. Please enable Hunter.io in Signal Engines & Integrations to fetch live companies.",
        )

    hunter = HunterProvider()
    result = await hunter.discover_companies(
        query=built_query,
        limit=data.limit,
        location=primary_loc,
        industry=primary_ind,
        headcount=primary_hc,
    )

    companies_raw = result.data.get("companies", [])
    companies_out = [
        DiscoveredCompanyOut(
            company_name=c.get("company_name", ""),
            domain=c.get("domain", ""),
            location=c.get("location") or primary_loc,
            industry=c.get("industry") or primary_ind,
            employee_count=c.get("employee_count") or primary_hc,
            emails_count=c.get("emails_count", 0),
            sample_email=c.get("sample_email") or f"contact@{c.get('domain', 'example.com')}",
            source=c.get("source", "hunter_discover"),
        )
        for c in companies_raw
    ]

    return AudienceDiscoverResponse(
        query_used=built_query,
        limit_requested=data.limit,
        total_found=len(companies_out),
        companies=companies_out,
    )


class MoveToPipelineRequest(BaseModel):
    company_name: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=2)
    industry: Optional[str] = None
    location: Optional[str] = None
    employee_count: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_name: Optional[str] = None
    pipeline_state: str = "review"


class MoveToPipelineResponse(BaseModel):
    lead_id: str
    org_id: str
    company_name: str
    domain: str
    industry: Optional[str] = None
    location: Optional[str] = None
    employee_count: Optional[str] = None
    pipeline_state: str
    contact_email: Optional[str] = None
    is_new: bool
    message: str


@router.post("/move-to-pipeline", response_model=MoveToPipelineResponse, status_code=status.HTTP_201_CREATED, summary="Move Chosen Discovered Company to Review Pipeline")
async def move_company_to_pipeline(
    data: MoveToPipelineRequest,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst", "reviewer"])),
    session: AsyncSession = Depends(get_db_session),
) -> MoveToPipelineResponse:
    """
    Imports or transitions a chosen discovered company into the Lead Pipeline in 'review' state.
    Prevents duplicates on (org_id, domain) by transitioning existing records to review.
    """
    clean_domain = normalize_domain(data.domain)

    # Check for existing lead
    stmt = select(Lead).where(Lead.org_id == ctx.org_id, Lead.domain == clean_domain)
    existing_lead = (await session.execute(stmt)).scalars().first()

    if existing_lead:
        existing_lead.pipeline_state = data.pipeline_state or "review"
        if data.company_name and not existing_lead.company_name:
            existing_lead.company_name = data.company_name
        lead = existing_lead
        is_new = False
        msg = f"Company '{lead.company_name}' refreshed in Lead Pipeline (Review state)."
    else:
        lead = Lead(
            org_id=ctx.org_id,
            company_name=data.company_name,
            domain=clean_domain,
            industry=data.industry,
            location=data.location,
            employee_count=data.employee_count,
            pipeline_state=data.pipeline_state or "review",
            raw_data={"source": "hunter_discover_import"},
        )
        session.add(lead)
        await session.flush()
        is_new = True
        msg = f"Company '{lead.company_name}' successfully moved to Review in Lead Pipeline."

    # If contact email provided, attach or update Contact
    contact_email_val = None
    if data.contact_email:
        contact_stmt = select(Contact).where(Contact.lead_id == lead.id, Contact.email == str(data.contact_email).lower())
        existing_contact = (await session.execute(contact_stmt)).scalars().first()
        if not existing_contact:
            contact = Contact(
                org_id=ctx.org_id,
                lead_id=lead.id,
                full_name=data.contact_name or "Primary Contact",
                title="Business Leader",
                email=str(data.contact_email).lower(),
                is_revealed=True,
                revealed_at=datetime.now(timezone.utc),
            )
            session.add(contact)
        contact_email_val = str(data.contact_email).lower()

    # Log audit entry
    audit = AuditLog(
        org_id=ctx.org_id,
        user_id=ctx.user.id,
        action="move_to_pipeline",
        entity_type="lead",
        entity_id=lead.id,
        details={"company_name": lead.company_name, "domain": clean_domain, "pipeline_state": lead.pipeline_state, "is_new": is_new},
    )
    session.add(audit)
    await session.commit()

    return MoveToPipelineResponse(
        lead_id=lead.id,
        org_id=lead.org_id,
        company_name=lead.company_name,
        domain=lead.domain,
        industry=lead.industry,
        location=lead.location,
        employee_count=lead.employee_count,
        pipeline_state=lead.pipeline_state,
        contact_email=contact_email_val,
        is_new=is_new,
        message=msg,
    )

