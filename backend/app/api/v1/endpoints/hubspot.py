from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import urllib.parse
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.deps import TenantContext, get_tenant_context, require_role
from backend.app.core.encryption import (
    decrypt_credentials,
    encrypt_credentials,
    generate_oauth_state,
    validate_oauth_state,
)
from backend.app.models.entities import AuditLog, Contact, CRMConnection, CRMSync, Lead, User
from backend.app.providers.hubspot import HubSpotProvider
from backend.app.providers.hubspot_mapping import (
    fetch_portal_industry_options,
    validate_sync_payload,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class HubSpotAuthorizeResponse(BaseModel):
    authorization_url: str
    state: str


class HubSpotStatusResponse(BaseModel):
    connected: bool
    status: str
    mode: str
    portal_id: Optional[str] = None
    hub_domain: Optional[str] = None
    last_sync_at: Optional[str] = None
    expires_at: Optional[int] = None


class HubSpotDisconnectResponse(BaseModel):
    success: bool
    message: str


class FieldValidationItem(BaseModel):
    field: str
    leadflow_value: Optional[Any] = None
    hubspot_property: str
    hubspot_value: Optional[Any] = None
    status: str  # 'ready', 'mapped', 'omitted_warning', 'omitted', 'error'
    is_blocking: bool = False
    message: str


class HubSpotPreviewResponse(BaseModel):
    lead_id: str
    company_name: str
    domain: str
    operation: str  # 'create' | 'update'
    existing_remote_company_id: Optional[str] = None
    is_valid: bool
    has_blocking_errors: bool
    field_validations: List[FieldValidationItem] = []
    warnings: List[str] = []
    errors: List[str] = []


class HubSpotSyncResponse(BaseModel):
    lead_id: str
    pipeline_state: str
    remote_company_id: Optional[str] = None
    remote_contact_id: Optional[str] = None
    company_status: str = "synced"
    contact_status: str = "none"
    sync_status: str
    message: str
    warnings: List[str] = []
    field_validations: List[FieldValidationItem] = []
    correlation_id: Optional[str] = None


class HubSpotSyncHistoryItem(BaseModel):
    id: str
    lead_id: str
    company_name: Optional[str] = None
    domain: Optional[str] = None
    provider: str = "hubspot"
    remote_company_id: Optional[str] = None
    remote_contact_id: Optional[str] = None
    sync_status: str
    created_at: str
    initiated_by_user: Optional[str] = None
    company_status: Optional[str] = None
    contact_status: Optional[str] = None
    warnings: List[str] = []
    omitted_fields: List[str] = []
    error_message: Optional[str] = None
    correlation_id: Optional[str] = None
    retry_eligible: bool = False
    retry_reason: Optional[str] = None


class HubSpotSyncHistoryResponse(BaseModel):
    items: List[HubSpotSyncHistoryItem]
    total: int


@router.get(
    "/authorize",
    response_model=HubSpotAuthorizeResponse,
    summary="Start HubSpot OAuth Authorization Flow",
)
async def start_hubspot_oauth(
    ctx: TenantContext = Depends(require_role(["owner", "admin"])),
) -> HubSpotAuthorizeResponse:
    """
    Generates a cryptographically signed OAuth state JWT bound to the initiating user
    and organization, and returns the HubSpot authorization URL.
    """
    provider = HubSpotProvider()
    state = generate_oauth_state(user_id=ctx.user.id, org_id=ctx.org_id)

    try:
        auth_url = provider.build_authorization_url(state=state)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return HubSpotAuthorizeResponse(
        authorization_url=auth_url,
        state=state,
    )


@router.get(
    "/callback",
    summary="Handle HubSpot OAuth Redirect Callback",
)
async def hubspot_oauth_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse:
    """
    Browser callback endpoint for HubSpot OAuth flow:
    1. Validates OAuth error response if user denied permissions.
    2. Validates cryptographically signed state token (CSRF + replay defense).
    3. Exchanges authorization code for access and refresh tokens.
    4. Encrypts and securely persists credentials in CRMConnection table.
    5. Redirects user back to frontend dashboard with status query params.
    """
    frontend_base = settings.FRONTEND_URL.rstrip("/")

    # Handle provider-level error or denial
    if error:
        err_msg = error_description or error or "OAuth authorization was denied or failed."
        logger.warning(f"HubSpot OAuth callback received error: {err_msg}")
        safe_err = urllib.parse.quote_plus(err_msg)
        return RedirectResponse(url=f"{frontend_base}/?hubspot_error={safe_err}")

    if not code or not state:
        logger.warning("HubSpot OAuth callback missing code or state parameters")
        return RedirectResponse(url=f"{frontend_base}/?hubspot_error=missing_code_or_state")

    # Cryptographically validate state
    try:
        payload = await validate_oauth_state(state)
    except ValueError as val_err:
        logger.error(f"HubSpot OAuth state validation failed: {val_err}")
        safe_err = urllib.parse.quote_plus(str(val_err))
        return RedirectResponse(url=f"{frontend_base}/?hubspot_error={safe_err}")

    user_id = payload.get("sub")
    org_id = payload.get("org_id")

    if not user_id or not org_id:
        return RedirectResponse(url=f"{frontend_base}/?hubspot_error=invalid_state_payload")

    # Set PostgreSQL RLS context for this tenant on the active transaction
    await set_rls_tenant_context(session, org_id)

    provider = HubSpotProvider()

    # Exchange authorization code for tokens
    try:
        token_data = await provider.exchange_code_for_tokens(code)
    except Exception as exc:
        logger.error(f"HubSpot token exchange error: {exc}")
        safe_err = urllib.parse.quote_plus(f"Token exchange failed: {str(exc)}")
        return RedirectResponse(url=f"{frontend_base}/?hubspot_error={safe_err}")

    # Authenticated encryption of tenant credentials
    encrypted_creds = encrypt_credentials(token_data)

    # Persist or update CRMConnection record
    stmt = select(CRMConnection).where(CRMConnection.org_id == org_id)
    res = await session.execute(stmt)
    conn = res.scalars().first()

    effective_mode = settings.PROVIDER_HUBSPOT_MODE
    if effective_mode == "disabled":
        effective_mode = "live"

    if not conn:
        conn = CRMConnection(
            org_id=org_id,
            provider="hubspot",
            mode=effective_mode,
            encrypted_credentials=encrypted_creds,
            status="connected",
        )
        session.add(conn)
    else:
        conn.provider = "hubspot"
        conn.mode = effective_mode
        conn.encrypted_credentials = encrypted_creds
        conn.status = "connected"

    await session.flush()

    # Write audit log
    audit = AuditLog(
        org_id=org_id,
        user_id=user_id,
        action="connect_hubspot_oauth",
        entity_type="crm_connection",
        entity_id=conn.id,
        details={
            "provider": "hubspot",
            "portal_id": token_data.get("portal_id"),
            "hub_domain": token_data.get("hub_domain"),
        },
    )
    session.add(audit)
    await session.commit()

    portal_id = token_data.get("portal_id", "")
    return RedirectResponse(
        url=f"{frontend_base}/?hubspot_connected=true&portal_id={urllib.parse.quote_plus(portal_id)}"
    )


@router.get(
    "/status",
    response_model=HubSpotStatusResponse,
    summary="Get Organization HubSpot Connection Status",
)
async def get_hubspot_status(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> HubSpotStatusResponse:
    """
    Returns the current HubSpot connection status for the tenant organization
    without exposing secrets or tokens.
    """
    stmt = select(CRMConnection).where(CRMConnection.org_id == ctx.org_id)
    res = await session.execute(stmt)
    conn = res.scalars().first()

    if not conn or conn.status != "connected" or not conn.encrypted_credentials:
        return HubSpotStatusResponse(
            connected=False,
            status="disconnected",
            mode="disabled",
            portal_id=None,
            hub_domain=None,
            last_sync_at=conn.last_sync_at.isoformat() if conn and conn.last_sync_at else None,
            expires_at=None,
        )

    portal_id = None
    hub_domain = None
    expires_at = None
    try:
        creds = decrypt_credentials(conn.encrypted_credentials)
        portal_id = creds.get("portal_id")
        hub_domain = creds.get("hub_domain")
        expires_at = creds.get("expires_at")
    except Exception as exc:
        logger.warning(f"Could not decrypt stored HubSpot credentials: {exc}")
        return HubSpotStatusResponse(
            connected=False,
            status="error",
            mode=conn.mode,
            portal_id=None,
            hub_domain=None,
            last_sync_at=conn.last_sync_at.isoformat() if conn.last_sync_at else None,
            expires_at=None,
        )

    return HubSpotStatusResponse(
        connected=True,
        status="connected",
        mode=conn.mode,
        portal_id=portal_id,
        hub_domain=hub_domain,
        last_sync_at=conn.last_sync_at.isoformat() if conn.last_sync_at else None,
        expires_at=expires_at,
    )


@router.post(
    "/disconnect",
    response_model=HubSpotDisconnectResponse,
    summary="Disconnect HubSpot Account",
)
async def disconnect_hubspot(
    ctx: TenantContext = Depends(require_role(["owner", "admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> HubSpotDisconnectResponse:
    """
    Safely disconnects HubSpot for the caller's organization by wiping stored encrypted credentials.
    """
    stmt = select(CRMConnection).where(CRMConnection.org_id == ctx.org_id)
    res = await session.execute(stmt)
    conn = res.scalars().first()

    if conn:
        conn.status = "disconnected"
        conn.encrypted_credentials = None
        conn.mode = "disabled"

        audit = AuditLog(
            org_id=ctx.org_id,
            user_id=ctx.user.id,
            action="disconnect_hubspot",
            entity_type="crm_connection",
            entity_id=conn.id,
            details={"provider": "hubspot"},
        )
        session.add(audit)
        await session.commit()

    return HubSpotDisconnectResponse(
        success=True,
        message="HubSpot integration disconnected successfully.",
    )


@router.get(
    "/preview/{lead_id}",
    response_model=HubSpotPreviewResponse,
    summary="Get Pre-Sync Validation and Field Preview for Lead",
)
async def preview_hubspot_sync(
    lead_id: str,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst"])),
    session: AsyncSession = Depends(get_db_session),
) -> HubSpotPreviewResponse:
    """
    Validates company and contact fields before writing to HubSpot.
    Separates blocking errors from non-blocking warnings, and checks
    whether the company will be created new or updated in HubSpot.
    """
    # 1. Fetch lead with tenant boundary check
    lead_stmt = select(Lead).where(Lead.id == lead_id, Lead.org_id == ctx.org_id)
    lead_res = await session.execute(lead_stmt)
    lead = lead_res.scalars().first()
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found in this organization.",
        )

    # 2. Enforce approval gating
    if lead.pipeline_state not in ("approved", "drafted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only approved leads can be previewed or synced to HubSpot CRM. Current pipeline state: '{lead.pipeline_state}'.",
        )

    # 3. Fetch tenant CRM Connection
    conn_stmt = select(CRMConnection).where(CRMConnection.org_id == ctx.org_id)
    conn_res = await session.execute(conn_stmt)
    conn = conn_res.scalars().first()

    if not conn or conn.status != "connected" or not conn.encrypted_credentials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HubSpot CRM is not connected for this organization. Please connect HubSpot in Workspace Settings first.",
        )

    # 4. Decrypt credentials & fetch allowed industries
    try:
        credentials = decrypt_credentials(conn.encrypted_credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to decrypt stored CRM credentials: {str(exc)}",
        )

    access_token = credentials.get("access_token")
    allowed_industries = None
    if conn.mode == "live" and access_token:
        try:
            portal_id = credentials.get("portal_id")
            allowed_industries = await fetch_portal_industry_options(access_token, portal_id)
        except Exception as e:
            logger.warning(f"Failed to fetch portal industry options in preview: {e}")

    # 5. Fetch associated contact if available
    contact_stmt = (
        select(Contact)
        .where(Contact.lead_id == lead.id, Contact.org_id == ctx.org_id)
        .order_by(Contact.is_revealed.desc(), Contact.created_at.desc())
    )
    contact_res = await session.execute(contact_stmt)
    contact = contact_res.scalars().first()

    contact_dict = None
    if contact and contact.email:
        contact_dict = {
            "email": contact.email,
            "full_name": contact.full_name,
            "title": contact.title,
            "phone": contact.phone,
            "company_name": lead.company_name,
        }

    company_data = {
        "company_name": lead.company_name,
        "domain": lead.domain,
        "industry": lead.industry,
        "location": lead.location,
        "employee_count": lead.employee_count,
    }

    validation = validate_sync_payload(
        company_data=company_data,
        contact_data=contact_dict,
        allowed_industries=allowed_industries,
    )

    # 6. Check existing company in HubSpot
    operation = "create"
    existing_id = None
    if conn.mode == "live" and access_token and lead.domain:
        provider = HubSpotProvider(mode="live")
        try:
            existing_id = await provider.search_company_by_domain(lead.domain, access_token)
            if existing_id:
                operation = "update"
        except Exception as e:
            logger.warning(f"Error checking existing company in HubSpot: {e}")

    return HubSpotPreviewResponse(
        lead_id=lead.id,
        company_name=lead.company_name,
        domain=lead.domain,
        operation=operation,
        existing_remote_company_id=existing_id,
        is_valid=validation["is_valid"],
        has_blocking_errors=validation["has_blocking_errors"],
        field_validations=[FieldValidationItem(**fv) for fv in validation["field_validations"]],
        warnings=validation["warnings"],
        errors=validation["errors"],
    )


@router.get(
    "/history",
    response_model=HubSpotSyncHistoryResponse,
    summary="List Organization HubSpot Sync History",
)
async def get_hubspot_sync_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst"])),
    session: AsyncSession = Depends(get_db_session),
) -> HubSpotSyncHistoryResponse:
    """
    Returns persisted CRM sync history for the tenant organization,
    enforcing PostgreSQL Row-Level Security and tenant isolation.
    """
    # 1. Total count
    count_stmt = select(func.count(CRMSync.id)).where(CRMSync.org_id == ctx.org_id, CRMSync.provider == "hubspot")
    total = (await session.execute(count_stmt)).scalar() or 0

    # 2. Paginated rows with lead info
    stmt = (
        select(CRMSync, Lead.company_name, Lead.domain)
        .outerjoin(Lead, CRMSync.lead_id == Lead.id)
        .where(CRMSync.org_id == ctx.org_id, CRMSync.provider == "hubspot")
        .order_by(CRMSync.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    res = await session.execute(stmt)
    rows = res.all()

    items = []
    for crm_sync, comp_name, domain in rows:
        payload = crm_sync.response_payload or {}
        warnings = payload.get("warnings", [])
        omitted = payload.get("omitted_fields", [])
        error_msg = payload.get("error_message")
        corr_id = payload.get("correlation_id")
        comp_status = payload.get("company_status", crm_sync.sync_status)
        contact_status = payload.get("contact_status", "none")

        retry_eligible = crm_sync.sync_status in ("failed", "partially_synced")
        retry_reason = None
        if retry_eligible:
            retry_reason = "Sync issue can be corrected and retried safely."

        items.append(
            HubSpotSyncHistoryItem(
                id=crm_sync.id,
                lead_id=crm_sync.lead_id,
                company_name=comp_name or payload.get("company_name"),
                domain=domain or payload.get("domain"),
                provider="hubspot",
                remote_company_id=crm_sync.remote_company_id,
                remote_contact_id=crm_sync.remote_contact_id,
                sync_status=crm_sync.sync_status,
                created_at=crm_sync.created_at.isoformat() if crm_sync.created_at else "",
                initiated_by_user=payload.get("initiated_by_user"),
                company_status=comp_status,
                contact_status=contact_status,
                warnings=warnings,
                omitted_fields=omitted,
                error_message=error_msg,
                correlation_id=corr_id,
                retry_eligible=retry_eligible,
                retry_reason=retry_reason,
            )
        )

    return HubSpotSyncHistoryResponse(items=items, total=total)


@router.post(
    "/sync/{lead_id}",
    response_model=HubSpotSyncResponse,
    summary="Sync Approved Lead to HubSpot CRM",
)
async def sync_lead_to_hubspot(
    lead_id: str,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst"])),
    session: AsyncSession = Depends(get_db_session),
) -> HubSpotSyncResponse:
    """
    Synchronizes an approved lead to the tenant's connected HubSpot account.
    Enforces tenant isolation, lead qualification approval status,
    safe idempotency, and records comprehensive sync history.
    """
    # 1. Fetch lead with tenant boundary check
    lead_stmt = select(Lead).where(Lead.id == lead_id, Lead.org_id == ctx.org_id)
    lead_res = await session.execute(lead_stmt)
    lead = lead_res.scalars().first()
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found in this organization.",
        )

    # 2. Enforce approval gating
    if lead.pipeline_state not in ("approved", "drafted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only approved leads can be synced to HubSpot CRM. Current pipeline state: '{lead.pipeline_state}'.",
        )

    # 3. Fetch tenant CRM Connection
    conn_stmt = select(CRMConnection).where(CRMConnection.org_id == ctx.org_id)
    conn_res = await session.execute(conn_stmt)
    conn = conn_res.scalars().first()

    if not conn or conn.status != "connected" or not conn.encrypted_credentials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HubSpot CRM is not connected for this organization. Please connect HubSpot in Workspace Settings first.",
        )

    # 4. Decrypt credentials
    try:
        credentials = decrypt_credentials(conn.encrypted_credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to decrypt stored CRM credentials: {str(exc)}",
        )

    # 5. Fetch associated contact if available
    contact_stmt = (
        select(Contact)
        .where(Contact.lead_id == lead.id, Contact.org_id == ctx.org_id)
        .order_by(Contact.is_revealed.desc(), Contact.created_at.desc())
    )
    contact_res = await session.execute(contact_stmt)
    contact = contact_res.scalars().first()

    contact_dict = None
    if contact and contact.email:
        contact_dict = {
            "email": contact.email,
            "full_name": contact.full_name,
            "title": contact.title,
            "phone": contact.phone,
            "company_name": lead.company_name,
        }

    company_data = {
        "company_name": lead.company_name,
        "domain": lead.domain,
        "industry": lead.industry,
        "location": lead.location,
        "employee_count": lead.employee_count,
    }

    # 6. Execute sync via HubSpotProvider with error recovery
    provider = HubSpotProvider(mode=conn.mode)
    try:
        sync_result = await provider.sync_lead(
            company_data=company_data,
            contact_data=contact_dict,
            credentials=credentials,
            mode=conn.mode,
        )
    except Exception as exc:
        logger.error(f"HubSpot sync failed for lead {lead.id}: {exc}")
        # Persist the failure in CRMSync so users see the accurate history
        failed_sync_log = CRMSync(
            org_id=ctx.org_id,
            lead_id=lead.id,
            provider="hubspot",
            remote_company_id=None,
            remote_contact_id=None,
            sync_status="failed",
            response_payload={
                "error_message": str(exc),
                "company_name": lead.company_name,
                "domain": lead.domain,
                "initiated_by_user": ctx.user.email,
                "failed_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        session.add(failed_sync_log)
        await session.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST if "validation" in str(exc).lower() else status.HTTP_502_BAD_GATEWAY,
            detail=f"HubSpot CRM sync failed: {str(exc)}",
        )

    # 7. Update encrypted storage if refreshed
    refreshed_creds = sync_result.get("refreshed_credentials")
    if refreshed_creds:
        conn.encrypted_credentials = encrypt_credentials(refreshed_creds)

    conn.last_sync_at = datetime.now(timezone.utc)

    # 8. Record successful or partially synced CRMSync log
    overall_status = sync_result.get("status", "synced")
    response_payload = sync_result.get("response_payload", {})
    response_payload["initiated_by_user"] = ctx.user.email
    response_payload["company_name"] = lead.company_name
    response_payload["domain"] = lead.domain

    crm_sync_log = CRMSync(
        org_id=ctx.org_id,
        lead_id=lead.id,
        provider="hubspot",
        remote_company_id=sync_result.get("remote_company_id"),
        remote_contact_id=sync_result.get("remote_contact_id"),
        sync_status=overall_status,
        response_payload=response_payload,
    )
    session.add(crm_sync_log)

    # 9. Transition lead pipeline state to synced
    lead.pipeline_state = "synced"

    # 10. Audit trail
    audit = AuditLog(
        org_id=ctx.org_id,
        user_id=ctx.user.id,
        action="sync_lead_hubspot",
        entity_type="lead",
        entity_id=lead.id,
        details={
            "remote_company_id": sync_result.get("remote_company_id"),
            "remote_contact_id": sync_result.get("remote_contact_id"),
            "sync_status": overall_status,
            "mode": conn.mode,
        },
    )
    session.add(audit)
    await session.commit()

    field_vals = [
        FieldValidationItem(**fv) for fv in sync_result.get("field_validations", [])
    ]

    msg = f"Lead '{lead.company_name}' synchronized successfully to HubSpot CRM."
    if overall_status == "partially_synced":
        msg = f"Company '{lead.company_name}' synced to HubSpot, but contact sync was skipped or encountered an issue."

    return HubSpotSyncResponse(
        lead_id=lead.id,
        pipeline_state=lead.pipeline_state,
        remote_company_id=sync_result.get("remote_company_id"),
        remote_contact_id=sync_result.get("remote_contact_id"),
        company_status=sync_result.get("company_status", "synced"),
        contact_status=sync_result.get("contact_status", "none"),
        sync_status=overall_status,
        message=msg,
        warnings=sync_result.get("warnings", []),
        field_validations=field_vals,
    )
