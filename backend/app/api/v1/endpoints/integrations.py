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
        "key": "google_pagespeed",
        "name": "Google PageSpeed Insights",
        "category": "Core Web Vitals & Performance",
        "enabled": False,
        "mode": "disabled",
        "free_quota_description": "25,000 queries / day (Free Google Cloud API Key)",
        "is_configured": bool(settings.GOOGLE_PAGESPEED_API_KEY),
        "status_label": "Ready to configure with free API key",
    },
    {
        "key": "hunter",
        "name": "Hunter.io Domain Search",
        "category": "Email Verification",
        "enabled": False,
        "mode": "disabled",
        "free_quota_description": "25 searches / month (Strict free safety budget)",
        "is_configured": False,
        "status_label": "Quota-capped free tier",
    },
    {
        "key": "apollo",
        "name": "Apollo.io API",
        "category": "Lead Enrichment",
        "enabled": False,
        "mode": "disabled",
        "free_quota_description": "API restricted to paid tiers ($49+/mo). Free web exports only.",
        "is_configured": False,
        "status_label": "Disabled by Policy (No free API)",
    },
    {
        "key": "snov",
        "name": "Snov.io API",
        "category": "Contact Discovery",
        "enabled": False,
        "mode": "disabled",
        "free_quota_description": "One-time 50 credit trial upon sign-up (No permanent free tier).",
        "is_configured": False,
        "status_label": "Disabled by Policy (Paid after trial)",
    },
    {
        "key": "hubspot",
        "name": "HubSpot CRM Synchronization",
        "category": "CRM Integration",
        "enabled": False,
        "mode": "disabled",
        "free_quota_description": "Free Developer Test Account (100 req / 10s)",
        "is_configured": bool(settings.HUBSPOT_ACCESS_TOKEN),
        "status_label": "Awaiting Phase 8 developer authorization",
    },
    {
        "key": "openrouter",
        "name": "OpenRouter AI Personalization",
        "category": "Outreach Drafting",
        "enabled": False,
        "mode": "disabled",
        "free_quota_description": "Free models (20 req/min, 200/day). Deterministic fallback active.",
        "is_configured": bool(settings.LLM_API_KEY),
        "status_label": "Disabled (Deterministic rules active)",
    },
]


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
        # Check if tenant has toggled this provider
        is_enabled = toggles.get(p["key"], p["enabled"])
        # If master switch is off, non-local providers are disabled
        effective_mode = p["mode"]
        if not master_switch and p["key"] != "safe_crawler":
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
                status_label=p["status_label"] if master_switch else "Paused (Master Switch OFF)",
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
        # Protect against enabling policy-disabled providers (Apollo, Snov)
        for k, v in data.provider_toggles.items():
            if k in ["apollo", "snov"] and v:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot enable {k}: provider has no permanent free API tier under Rule A.",
                )
            existing_toggles[k] = v
        curr_integrations["provider_toggles"] = existing_toggles

    curr_settings["integrations"] = curr_integrations
    org.settings = curr_settings
    session.add(org)
    await session.commit()

    return await get_integration_settings(ctx=ctx)
