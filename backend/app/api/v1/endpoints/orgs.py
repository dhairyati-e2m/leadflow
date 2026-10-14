from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.deps import TenantContext, get_current_user, get_tenant_context, require_role
from backend.app.core.security import create_access_token, create_refresh_token, revoke_user_sessions
from backend.app.models.entities import AuditLog, Membership, Organization, User
from backend.app.api.v1.endpoints.auth import generate_slug, normalize_org_name

router = APIRouter()


class CreateOrgRequest(BaseModel):
    name: str = Field(min_length=2)


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="analyst", pattern="^(owner|admin|analyst|reviewer)$")


class OrgSummary(BaseModel):
    id: str
    name: str
    slug: str
    role: str


class OrgMemberOut(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str
    created_at: Optional[str] = None


class TransferAdminRequest(BaseModel):
    target_user_id: Optional[str] = None
    target_email: Optional[EmailStr] = None


@router.get("", response_model=List[OrgSummary], summary="List User's Organizations")
async def list_user_orgs(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[OrgSummary]:
    stmt = (
        select(Organization, Membership.role)
        .join(Membership, Organization.id == Membership.org_id)
        .where(Membership.user_id == user.id, Organization.is_active == True)
    )
    result = await session.execute(stmt)
    return [
        OrgSummary(id=org.id, name=org.name, slug=org.slug, role=role)
        for org, role in result.all()
    ]


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED, summary="Create Additional Organization")
async def create_organization(
    data: CreateOrgRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    norm_org_name = normalize_org_name(data.name)
    existing_org_stmt = select(Organization).where(Organization.normalized_name == norm_org_name)
    existing_org = (await session.execute(existing_org_stmt)).scalars().first()
    if existing_org:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organisation with these details already exists. If you belong to this organisation, contact its administrator or request access.",
        )

    slug = generate_slug(data.name)
    counter = 1
    while True:
        check = select(Organization).where(Organization.slug == slug)
        if not (await session.execute(check)).scalars().first():
            break
        slug = f"{generate_slug(data.name)}-{counter}"
        counter += 1

    org = Organization(name=data.name.strip(), normalized_name=norm_org_name, slug=slug, is_active=True)
    session.add(org)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organisation with these details already exists. If you belong to this organisation, contact its administrator or request access.",
        )

    await set_rls_tenant_context(session, org.id)

    membership = Membership(org_id=org.id, user_id=user.id, role="owner")
    session.add(membership)

    audit = AuditLog(
        org_id=org.id,
        user_id=user.id,
        action="create_organization",
        entity_type="organization",
        entity_id=org.id,
        details={"org_name": org.name, "created_by": user.email},
    )
    session.add(audit)
    await session.commit()

    return {"id": org.id, "name": org.name, "slug": org.slug, "role": "owner"}


@router.post("/{org_id}/switch", summary="Switch Active Organization Token")
async def switch_organization(
    org_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    mem_stmt = select(Membership).where(
        Membership.user_id == user.id,
        Membership.org_id == org_id,
    )
    membership = (await session.execute(mem_stmt)).scalars().first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Not a member of this organization",
        )

    access_token = create_access_token(user_id=user.id, org_id=org_id, role=membership.role)
    refresh_token = create_refresh_token(user_id=user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "org_id": org_id,
        "role": membership.role,
    }


@router.get("/{org_id}/members", response_model=List[OrgMemberOut], summary="List Organization Members")
async def list_org_members(
    org_id: str,
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst", "reviewer"])),
    session: AsyncSession = Depends(get_db_session),
) -> List[OrgMemberOut]:
    if ctx.org_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot view members of another organisation",
        )

    stmt = (
        select(Membership, User)
        .join(User, Membership.user_id == User.id)
        .where(Membership.org_id == org_id)
        .order_by(Membership.created_at.asc())
    )
    results = await session.execute(stmt)
    return [
        OrgMemberOut(
            user_id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=m.role,
            created_at=m.created_at.isoformat() if m.created_at else None,
        )
        for m, u in results.all()
    ]


@router.post("/members", status_code=status.HTTP_201_CREATED, summary="Add Member to Organization")
async def add_org_member(
    data: AddMemberRequest,
    ctx: TenantContext = Depends(require_role(["owner", "admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    # Look up target user
    user_stmt = select(User).where(User.email == data.email.lower())
    target_user = (await session.execute(user_stmt)).scalars().first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No registered account found with email '{data.email}'. The user must register an account first.",
        )

    # Check if membership already exists
    mem_check = select(Membership).where(
        Membership.org_id == ctx.org_id,
        Membership.user_id == target_user.id,
    )
    if (await session.execute(mem_check)).scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member of this organization.")

    new_mem = Membership(
        org_id=ctx.org_id,
        user_id=target_user.id,
        role=data.role,
    )
    session.add(new_mem)

    audit = AuditLog(
        org_id=ctx.org_id,
        user_id=ctx.user.id,
        action="add_member",
        entity_type="membership",
        entity_id=target_user.id,
        details={"member_email": target_user.email, "role": data.role, "added_by": ctx.user.email},
    )
    session.add(audit)
    await session.commit()

    return {
        "org_id": ctx.org_id,
        "user_id": target_user.id,
        "email": target_user.email,
        "role": data.role,
    }


@router.post("/{org_id}/transfer-admin", summary="Transfer Organisation Administration to Another Member")
async def transfer_org_admin(
    org_id: str,
    data: TransferAdminRequest,
    ctx: TenantContext = Depends(require_role(["owner", "admin"])),
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """
    Atomically transfers administrative role to another member in the same organisation.
    The selected user becomes an Organisation Admin / Owner.
    The transferring admin is demoted to 'analyst' (standard member) and their active sessions
    are invalidated in Redis to revoke elevated permissions immediately.
    """
    if ctx.org_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot transfer administration for a different organisation",
        )

    # 1. Identify target user
    target_user = None
    if data.target_user_id:
        target_user = (await session.execute(select(User).where(User.id == data.target_user_id))).scalars().first()
    elif data.target_email:
        target_user = (await session.execute(select(User).where(User.email == data.target_email.lower()))).scalars().first()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either target_user_id or target_email for administration transfer.",
        )

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user account not found.",
        )

    if target_user.id == ctx.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer administration to yourself.",
        )

    # 2. Check target membership in this same organisation
    target_mem = (
        await session.execute(
            select(Membership).where(
                Membership.org_id == org_id,
                Membership.user_id == target_user.id,
            )
        )
    ).scalars().first()

    if not target_mem:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user is not a member of this organisation. Role transfer is only permitted to existing members of the same organisation.",
        )

    # 3. Fetch actor's membership
    actor_mem = (
        await session.execute(
            select(Membership).where(
                Membership.org_id == org_id,
                Membership.user_id == ctx.user.id,
            )
        )
    ).scalars().first()

    if not actor_mem:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Active membership not found.")

    # 4. Atomic role transfer
    previous_actor_role = actor_mem.role
    target_mem.role = "owner" if previous_actor_role == "owner" else "admin"
    actor_mem.role = "analyst"

    # 5. Audit Log
    audit = AuditLog(
        org_id=org_id,
        user_id=ctx.user.id,
        action="transfer_org_admin",
        entity_type="membership",
        entity_id=target_user.id,
        details={
            "transferred_by": ctx.user.email,
            "transferred_to": target_user.email,
            "target_new_role": target_mem.role,
            "actor_new_role": "analyst",
        },
    )
    session.add(audit)
    await session.commit()

    # 6. Revoke actor's sessions in Redis to purge elevated permissions across all devices
    await revoke_user_sessions(ctx.user.id)

    return {
        "message": f"Administration successfully transferred to {target_user.email}.",
        "target_user_id": target_user.id,
        "target_email": target_user.email,
        "target_role": target_mem.role,
        "previous_admin_role": "analyst",
    }
