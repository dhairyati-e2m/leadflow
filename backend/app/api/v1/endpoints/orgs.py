from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.deps import TenantContext, get_current_user, get_tenant_context, require_role
from backend.app.core.security import create_access_token, create_refresh_token
from backend.app.models.entities import Membership, Organization, User

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
    from backend.app.api.v1.endpoints.auth import generate_slug

    slug = generate_slug(data.name)
    counter = 1
    while True:
        check = select(Organization).where(Organization.slug == slug)
        if not (await session.execute(check)).scalars().first():
            break
        slug = f"{generate_slug(data.name)}-{counter}"
        counter += 1

    org = Organization(name=data.name, slug=slug, is_active=True)
    session.add(org)
    await session.flush()

    await set_rls_tenant_context(session, org.id)

    membership = Membership(org_id=org.id, user_id=user.id, role="owner")
    session.add(membership)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found.")

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
    await session.commit()

    return {
        "org_id": ctx.org_id,
        "user_id": target_user.id,
        "email": target_user.email,
        "role": data.role,
    }
