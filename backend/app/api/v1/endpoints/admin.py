from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.database import get_db_session
from backend.app.core.deps import TenantContext, get_current_user, get_tenant_context
from backend.app.models.entities import AuditLog, Lead, Membership, Organization, User

router = APIRouter()


class AdminOrgOut(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    operator_enabled: bool
    monthly_lead_quota: int
    user_count: int
    lead_count: int
    created_at: Optional[str] = None


class AdminOrgUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    operator_enabled: Optional[bool] = None
    monthly_lead_quota: Optional[int] = Field(None, ge=10, le=5000)


class AuditLogOut(BaseModel):
    id: str
    org_id: str
    user_id: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    details: Dict[str, Any]
    ip_address: Optional[str] = None
    created_at: str


@router.get("/orgs", response_model=List[AdminOrgOut], summary="List All Tenant Organizations (Super Admin)")
async def admin_list_orgs(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[AdminOrgOut]:
    # Require superuser / super_admin role
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin permissions required to access cross-tenant administration",
        )

    orgs_stmt = select(Organization).order_by(Organization.created_at.desc())
    orgs = (await session.execute(orgs_stmt)).scalars().all()

    response = []
    for org in orgs:
        # Count members
        mem_count_stmt = select(func.count(Membership.id)).where(Membership.org_id == org.id)
        user_count = (await session.execute(mem_count_stmt)).scalar() or 0

        # Count leads
        lead_count_stmt = select(func.count(Lead.id)).where(Lead.org_id == org.id)
        lead_count = (await session.execute(lead_count_stmt)).scalar() or 0

        org_settings = org.settings or {}
        operator_enabled = org_settings.get("operator_enabled", True)
        monthly_lead_quota = org_settings.get("monthly_lead_quota", 100)

        response.append(
            AdminOrgOut(
                id=org.id,
                name=org.name,
                slug=org.slug,
                is_active=org.is_active,
                operator_enabled=operator_enabled,
                monthly_lead_quota=monthly_lead_quota,
                user_count=user_count,
                lead_count=lead_count,
                created_at=org.created_at.isoformat() if org.created_at else None,
            )
        )

    return response


@router.patch("/orgs/{org_id}", response_model=AdminOrgOut, summary="Manage Organization Lifecycle & Quota (Super Admin)")
async def admin_update_org(
    org_id: str,
    data: AdminOrgUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> AdminOrgOut:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin permissions required",
        )

    org_stmt = select(Organization).where(Organization.id == org_id)
    org = (await session.execute(org_stmt)).scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    current_settings = dict(org.settings or {})

    if data.name is not None:
        org.name = data.name
    if data.is_active is not None:
        org.is_active = data.is_active
    if data.operator_enabled is not None:
        current_settings["operator_enabled"] = data.operator_enabled
    if data.monthly_lead_quota is not None:
        current_settings["monthly_lead_quota"] = data.monthly_lead_quota

    org.settings = current_settings

    # Audit log
    audit = AuditLog(
        org_id=org.id,
        user_id=user.id,
        action="admin_update_org",
        entity_type="organization",
        entity_id=org.id,
        details={
            "is_active": org.is_active,
            "operator_enabled": current_settings.get("operator_enabled"),
            "monthly_lead_quota": current_settings.get("monthly_lead_quota"),
        },
    )
    session.add(audit)
    await session.commit()

    # Counts
    mem_count = (await session.execute(select(func.count(Membership.id)).where(Membership.org_id == org.id))).scalar() or 0
    lead_count = (await session.execute(select(func.count(Lead.id)).where(Lead.org_id == org.id))).scalar() or 0

    return AdminOrgOut(
        id=org.id,
        name=org.name,
        slug=org.slug,
        is_active=org.is_active,
        operator_enabled=current_settings.get("operator_enabled", True),
        monthly_lead_quota=current_settings.get("monthly_lead_quota", 100),
        user_count=mem_count,
        lead_count=lead_count,
        created_at=org.created_at.isoformat() if org.created_at else None,
    )


@router.get("/audit-logs", response_model=List[AuditLogOut], summary="View Platform Audit Trail (Super Admin & Org Admin)")
async def list_audit_logs(
    org_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[AuditLogOut]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)

    if not user.is_superuser:
        # Normal user can only see logs from their own membership org
        mem_stmt = select(Membership.org_id).where(Membership.user_id == user.id)
        user_org_ids = (await session.execute(mem_stmt)).scalars().all()
        if not user_org_ids:
            return []
        target_org = org_id if org_id in user_org_ids else user_org_ids[0]
        stmt = stmt.where(AuditLog.org_id == target_org)
    elif org_id:
        stmt = stmt.where(AuditLog.org_id == org_id)

    logs = (await session.execute(stmt)).scalars().all()

    return [
        AuditLogOut(
            id=log.id,
            org_id=log.org_id,
            user_id=log.user_id,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details or {},
            ip_address=log.ip_address,
            created_at=log.created_at.isoformat(),
        )
        for log in logs
    ]
