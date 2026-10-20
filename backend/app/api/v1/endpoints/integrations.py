from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.database import get_db_session
from backend.app.core.deps import TenantContext, get_tenant_context, require_role
from backend.app.models.entities import Organization

router = APIRouter()


class ProviderControlItem(BaseModel):
    key: str
    name: str
    category: str
    enabled: bool
    mode: str  # "live", "mock", "disabled"
    free_quota_description: str
    is_configured: bool
    status_label: str


class IntegrationSettingsResponse(BaseModel):
    master_switch_enabled: bool
    providers: List[ProviderControlItem]


class UpdateIntegrationSettingsRequest(BaseModel):
    master_switch_enabled: Optional[bool] = None
    provider_toggles: Optional[Dict[str, bool]] = None


DEFAULT_PROVIDERS_CONFIG = [
    {
        "key": "safe_crawler",
        "name": "Local Safe Web Scanner",
        "category": "Crawling & Tech Detection",
        "enabled": True,
        "mode": "live",
        "free_quota_description": "Unlimited local execution (Zero external API cost)",
        "is_configured": True,
        "status_label": "Active (Local native engine)",
    },
    {
        "key": "brave",
        "name": "Brave Search API",
        "category": "Search & Company Discovery",
        "enabled": False,
        "mode": settings.PROVIDER_BRAVE_MODE,
        "free_quota_description": "2,000 queries / month free (1 req/sec). Safety limit: 1,600/mo.",
        "is_configured": bool(settings.BRAVE_API_KEY),
        "status_label": "Configured & Active" if settings.BRAVE_API_KEY else "Awaiting Free API Key",
    },
    {
        "key": "gemini",
        "name": "Google Gemini API (gemini-1.5-flash)",
        "category": "ICP Matching & Signal AI",
        "enabled": False,
        "mode": settings.PROVIDER_GEMINI_MODE,
        "free_quota_description": "1,500 requests/day, 15 RPM free recurring. Deterministic fallback active.",
        "is_configured": bool(settings.GEMINI_API_KEY),
        "status_label": "Configured & Active" if settings.GEMINI_API_KEY else "Awaiting Free API Key",
    },
    {
        "key": "serpapi",
        "name": "SerpApi Google Search",
        "category": "Company Discovery",
        "enabled": False,
        "mode": settings.PROVIDER_SERPAPI_MODE,
        "free_quota_description": "100 searches / month free recurring. Safety limit: 80/mo.",
        "is_configured": bool(settings.SERPAPI_API_KEY),
        "status_label": "Configured & Active" if settings.SERPAPI_API_KEY else "Awaiting Free API Key",
    },
    {
        "key": "hunter",
        "name": "Hunter.io Domain Search & Verification",
        "category": "Email Discovery & Verification",
        "enabled": False,
        "mode": settings.PROVIDER_HUNTER_MODE,
        "free_quota_description": "25 searches + 50 verifications/mo free. Gated to explicit contact reveal.",
        "is_configured": bool(settings.HUNTER_API_KEY),
        "status_label": "Configured & Active" if settings.HUNTER_API_KEY else "Awaiting Free API Key",
    },
    {
        "key": "resend",
        "name": "Resend Transactional Email",
        "category": "Security & J5 Password Reset",
        "enabled": False,
        "mode": settings.PROVIDER_RESEND_MODE,
        "free_quota_description": "100 emails / day free recurring (Safety limit: 80/day). Strictly transactional.",
        "is_configured": bool(settings.RESEND_API_KEY),
        "status_label": "Configured & Active" if settings.RESEND_API_KEY else "Awaiting Free API Key",
    },
    {
        "key": "google_pagespeed",
        "name": "Google PageSpeed Insights",
        "category": "Core Web Vitals & Performance",
        "enabled": False,
        "mode": settings.PROVIDER_PAGESPEED_MODE,
        "free_quota_description": "25,000 queries / day (Free Google Cloud API Key)",
        "is_configured": bool(settings.GOOGLE_PAGESPEED_API_KEY),
        "status_label": "Configured & Active" if settings.GOOGLE_PAGESPEED_API_KEY else "Ready to configure with free key",
    },
    {
        "key": "hubspot",
        "name": "HubSpot CRM Synchronization",
        "category": "CRM Integration",
        "enabled": False,
        "mode": settings.PROVIDER_HUBSPOT_MODE,
        "free_quota_description": "Free Developer Test Account (100 req / 10s)",
        "is_configured": bool((settings.HUBSPOT_CLIENT_ID and settings.HUBSPOT_CLIENT_SECRET) or settings.HUBSPOT_ACCESS_TOKEN),
        "status_label": "Configured & Ready" if ((settings.HUBSPOT_CLIENT_ID and settings.HUBSPOT_CLIENT_SECRET) or settings.HUBSPOT_ACCESS_TOKEN) else "Awaiting developer app credentials",
    },
]


def is_provider_enabled_for_org(org: Organization, provider_key: str) -> bool:
    """
    Checks whether a specific integration provider is currently enabled for this organization.
    Enforces master switch and individual provider toggles stored in org.settings.
    """
    org_settings = org.settings or {}
    integrations = org_settings.get("integrations", {})
    master_switch = integrations.get("master_switch_enabled", True)

    # Local safe scanner is built-in and always enabled
    if provider_key == "safe_crawler":
        return True

    # If the master switch is turned off, all external APIs are blocked
    if not master_switch:
        return False

    toggles = integrations.get("provider_toggles", {})
    if provider_key in toggles:
        return bool(toggles[provider_key])

    # If not explicitly toggled in org settings, default to configured status for hunter/resend
    for p in DEFAULT_PROVIDERS_CONFIG:
        if p["key"] == provider_key:
            default_val = p["is_configured"] if p["key"] in ("hunter", "resend", "google_pagespeed") else p["enabled"]
            return bool(default_val)

    return False


@router.get("", response_model=IntegrationSettingsResponse, summary="Get Organization Integration Settings")
async def get_integration_settings(
    ctx: TenantContext = Depends(get_tenant_context),
) -> IntegrationSettingsResponse:
    org_settings = ctx.organization.settings or {}
    integrations = org_settings.get("integrations", {})
    master_switch = integrations.get("master_switch_enabled", True)
    toggles = integrations.get("provider_toggles", {})

    provider_items = []
    for p in DEFAULT_PROVIDERS_CONFIG:
        default_val = p["is_configured"] if p["key"] in ("hunter", "resend", "google_pagespeed") else p["enabled"]
        is_enabled = toggles.get(p["key"], default_val)
        effective_mode = p["mode"]
        if not master_switch and p["key"] != "safe_crawler":
            effective_mode = "disabled"
        elif not is_enabled and p["key"] != "safe_crawler":
            effective_mode = "disabled"

        provider_items.append(
            ProviderControlItem(
                key=p["key"],
                name=p["name"],
                category=p["category"],
                enabled=is_enabled if master_switch else False,
                mode=effective_mode,
                free_quota_description=p["free_quota_description"],
                is_configured=p["is_configured"],
                status_label=p["status_label"] if (master_switch and is_enabled) else ("Paused (Master Switch OFF)" if not master_switch else "Disabled in Workspace Settings"),
            )
        )

    return IntegrationSettingsResponse(
        master_switch_enabled=master_switch,
        providers=provider_items,
    )


@router.put("", response_model=IntegrationSettingsResponse, summary="Update Organization Integration Settings")
async def update_integration_settings(
    data: UpdateIntegrationSettingsRequest,
    ctx: TenantContext = Depends(require_role(["owner", "admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> IntegrationSettingsResponse:
    org = ctx.organization
    curr_settings = dict(org.settings or {})
    curr_integrations = dict(curr_settings.get("integrations", {}))

    if data.master_switch_enabled is not None:
        curr_integrations["master_switch_enabled"] = data.master_switch_enabled

    if data.provider_toggles is not None:
        existing_toggles = dict(curr_integrations.get("provider_toggles", {}))
        # Protect against enabling policy-disabled providers (DataForSEO, Apollo, Snov, OpenRouter)
        for k, v in data.provider_toggles.items():
            if k in ["apollo", "snov", "dataforseo", "openrouter"] and v:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot enable {k}: provider has no permanent free API tier or is replaced.",
                )
            existing_toggles[k] = v
        curr_integrations["provider_toggles"] = existing_toggles

    curr_settings["integrations"] = curr_integrations
    org.settings = curr_settings
    ctx.organization.settings = curr_settings
    session.add(org)
    await session.commit()
    await session.refresh(org)

    return await get_integration_settings(ctx=ctx)
