from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.deps import TenantContext, get_current_user, get_tenant_context
from backend.app.core.security import hash_password, revoke_user_sessions
from backend.app.models.entities import AuditLog, Lead, Membership, Organization, User
from backend.app.services.notifications import create_and_send_notification

router = APIRouter()


class OrgAdminOut(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: Optional[str] = None


class AssignAdminRequest(BaseModel):
    email: EmailStr



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


class CreateAdminOrgRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    admin_email: EmailStr
    admin_full_name: Optional[str] = None
    monthly_lead_quota: Optional[int] = Field(100, ge=10, le=50000)


@router.post("/orgs", response_model=AdminOrgOut, status_code=status.HTTP_201_CREATED, summary="Create Organisation & Designate Org Admin (Super Admin)")
async def admin_create_org(
    data: CreateAdminOrgRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> AdminOrgOut:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin permissions required to provision organizations",
        )

    norm_name = re.sub(r"\s+", " ", data.name.strip().lower())
    existing_org = (
        await session.execute(select(Organization).where(Organization.normalized_name == norm_name))
    ).scalars().first()
    if existing_org:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An organisation with the name '{data.name.strip()}' already exists.",
        )

    base_slug = re.sub(r"[^a-z0-9]+", "-", data.name.strip().lower()).strip("-") or "org"
    slug = base_slug
    counter = 1
    while True:
        slug_check = await session.execute(select(Organization).where(Organization.slug == slug))
        if not slug_check.scalars().first():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    new_org = Organization(
        name=data.name.strip(),
        normalized_name=norm_name,
        slug=slug,
        is_active=True,
        settings={
            "monthly_lead_quota": data.monthly_lead_quota or 100,
            "operator_enabled": True,
        },
    )
    session.add(new_org)
    await session.flush()

    admin_email_clean = data.admin_email.lower().strip()
    admin_user = (
        await session.execute(select(User).where(User.email == admin_email_clean))
    ).scalars().first()

    if not admin_user:
        admin_user = User(
            email=admin_email_clean,
            hashed_password=hash_password("password123"),
            full_name=data.admin_full_name.strip() if data.admin_full_name else "Organisation Administrator",
            is_active=True,
        )
        session.add(admin_user)
        await session.flush()

    membership = Membership(
        org_id=new_org.id,
        user_id=admin_user.id,
        role="owner",
    )
    session.add(membership)

    await set_rls_tenant_context(session, new_org.id)
    audit = AuditLog(
        org_id=new_org.id,
        user_id=user.id,
        action="super_admin_create_org",
        entity_type="organization",
        entity_id=new_org.id,
        details={
            "org_name": new_org.name,
            "slug": new_org.slug,
            "admin_email": admin_email_clean,
            "monthly_lead_quota": data.monthly_lead_quota or 100,
        },
    )
    session.add(audit)

    await create_and_send_notification(
        session=session,
        recipient_id=admin_user.id,
        org_id=new_org.id,
        type="org_provisioned",
        title=f"Organisation {new_org.name} Provisioned",
        message=f"You have been designated as Organisation Administrator for {new_org.name} by Super Admin.",
        link="/",
        metadata_json={"org_id": new_org.id, "role": "owner"},
    )

    await session.commit()
    await session.refresh(new_org)

    return AdminOrgOut(
        id=new_org.id,
        name=new_org.name,
        slug=new_org.slug,
        is_active=new_org.is_active,
        operator_enabled=True,
        monthly_lead_quota=data.monthly_lead_quota or 100,
        user_count=1,
        lead_count=0,
        created_at=new_org.created_at.isoformat() if new_org.created_at else None,
    )


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

    await set_rls_tenant_context(session, org.id)

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


@router.get("/orgs/{org_id}/admins", response_model=List[OrgAdminOut], summary="List Organisation Administrators (Super Admin)")
async def admin_list_org_admins(
    org_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[OrgAdminOut]:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin permissions required")

    org = (await session.execute(select(Organization).where(Organization.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    stmt = (
        select(Membership, User)
        .join(User, Membership.user_id == User.id)
        .where(
            Membership.org_id == org_id,
            Membership.role.in_(["owner", "admin"]),
        )
        .order_by(Membership.created_at.asc())
    )
    results = await session.execute(stmt)
    return [
        OrgAdminOut(
            user_id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=m.role,
            is_active=u.is_active,
            created_at=m.created_at.isoformat() if m.created_at else None,
        )
        for m, u in results.all()
    ]


@router.get("/orgs/{org_id}/members", response_model=List[OrgAdminOut], summary="List All Organisation Members (Super Admin)")
async def admin_list_org_members(
    org_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[OrgAdminOut]:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin permissions required")

    org = (await session.execute(select(Organization).where(Organization.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    stmt = (
        select(Membership, User)
        .join(User, Membership.user_id == User.id)
        .where(Membership.org_id == org_id)
        .order_by(Membership.created_at.asc())
    )
    results = await session.execute(stmt)
    return [
        OrgAdminOut(
            user_id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=m.role,
            is_active=u.is_active,
            created_at=m.created_at.isoformat() if m.created_at else None,
        )
        for m, u in results.all()
    ]


@router.post("/orgs/{org_id}/admins", response_model=OrgAdminOut, summary="Assign Organisation Admin Access (Super Admin)")
async def admin_assign_org_admin(
    org_id: str,
    data: AssignAdminRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> OrgAdminOut:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin permissions required")

    org = (await session.execute(select(Organization).where(Organization.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    # Look up registered user
    target_user = (await session.execute(select(User).where(User.email == data.email.lower()))).scalars().first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No registered account found with email '{data.email}'. The user must register an account before being assigned as an organisation administrator.",
        )

    # Check if membership already exists
    mem_stmt = select(Membership).where(
        Membership.org_id == org_id,
        Membership.user_id == target_user.id,
    )
    membership = (await session.execute(mem_stmt)).scalars().first()

    if membership:
        membership.role = "admin"
    else:
        membership = Membership(
            org_id=org_id,
            user_id=target_user.id,
            role="admin",
        )
        session.add(membership)

    await set_rls_tenant_context(session, org_id)

    audit = AuditLog(
        org_id=org_id,
        user_id=user.id,
        action="assign_org_admin",
        entity_type="membership",
        entity_id=target_user.id,
        details={
            "target_email": target_user.email,
            "role": "admin",
            "assigned_by": user.email,
        },
    )
    session.add(audit)
    await session.commit()

    return OrgAdminOut(
        user_id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        role=membership.role,
        is_active=target_user.is_active,
        created_at=membership.created_at.isoformat() if membership.created_at else None,
    )


@router.delete("/orgs/{org_id}/admins/{user_id}", summary="Remove Organisation Admin Access (Super Admin)")
async def admin_remove_org_admin(
    org_id: str,
    user_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin permissions required")

    org = (await session.execute(select(Organization).where(Organization.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    # Check membership
    mem_stmt = select(Membership).where(
        Membership.org_id == org_id,
        Membership.user_id == user_id,
    )
    membership = (await session.execute(mem_stmt)).scalars().first()
    if not membership or membership.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an administrator of this organisation.",
        )

    # Last-admin protection: Guard against removing the last administrator of an active organisation
    admin_count_stmt = select(func.count(Membership.id)).where(
        Membership.org_id == org_id,
        Membership.role.in_(["owner", "admin"]),
    )
    admin_count = (await session.execute(admin_count_stmt)).scalar() or 0
    if admin_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last administrator of an active organisation. Assign another administrator before removing this admin.",
        )

    # Demote user to 'analyst' (preserving account and non-admin membership)
    membership.role = "analyst"

    await set_rls_tenant_context(session, org_id)

    audit = AuditLog(
        org_id=org_id,
        user_id=user.id,
        action="remove_org_admin",
        entity_type="membership",
        entity_id=user_id,
        details={
            "demoted_user_id": user_id,
            "new_role": "analyst",
            "removed_by": user.email,
        },
    )
    session.add(audit)
    await session.commit()

    # Invalidate session in Redis to immediately revoke elevated permissions
    await revoke_user_sessions(user_id)

    return {
        "message": "Organisation administrator privileges successfully revoked. User role set to analyst.",
        "user_id": user_id,
        "new_role": "analyst",
    }

