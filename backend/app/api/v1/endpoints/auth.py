import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.deps import get_current_user
from backend.app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from backend.app.models.entities import Membership, Organization, User

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Minimum 8 characters")
    full_name: str = Field(min_length=2)
    org_name: str = Field(min_length=2)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    org_id: Optional[str] = None  # If user belongs to multiple orgs, select one


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    org_id: str
    role: str


class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: str
    memberships: List[Dict[str, Any]]


def generate_slug(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return cleaned or "org"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED, summary="Register New User & Tenant Organization")
async def register(
    data: RegisterRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    # 1. Check if user already exists
    existing_user_stmt = select(User).where(User.email == data.email.lower())
    existing_user = (await session.execute(existing_user_stmt)).scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    # 2. Create User
    new_user = User(
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        is_active=True,
    )
    session.add(new_user)
    await session.flush()

    # 3. Create initial Organization
    base_slug = generate_slug(data.org_name)
    slug = base_slug
    # Handle slug collision if any
    counter = 1
    while True:
        slug_check = select(Organization).where(Organization.slug == slug)
        if not (await session.execute(slug_check)).scalars().first():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    new_org = Organization(
        name=data.org_name,
        slug=slug,
        is_active=True,
    )
    session.add(new_org)
    await session.flush()

    await set_rls_tenant_context(session, new_org.id)

    # 4. Create owner Membership
    membership = Membership(
        org_id=new_org.id,
        user_id=new_user.id,
        role="owner",
    )
    session.add(membership)
    await session.commit()

    # 5. Issue JWT tokens
    access_token = create_access_token(user_id=new_user.id, org_id=new_org.id, role="owner")
    refresh_token = create_refresh_token(user_id=new_user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=new_user.id,
        org_id=new_org.id,
        role="owner",
    )


@router.post("/login", response_model=TokenResponse, summary="Authenticate and Issue Tenant Token")
async def login(
    data: LoginRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    # 1. Look up user
    user_stmt = select(User).where(User.email == data.email.lower())
    user = (await session.execute(user_stmt)).scalars().first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled.")

    # 2. Fetch memberships
    mem_stmt = select(Membership).where(Membership.user_id == user.id)
    memberships = list((await session.execute(mem_stmt)).scalars().all())

    if not memberships:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User has no organization memberships.")

    # Select target organization
    if data.org_id:
        active_mem = next((m for m in memberships if m.org_id == data.org_id), None)
        if not active_mem:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of requested organization.")
    else:
        active_mem = memberships[0]  # Default to first organization

    access_token = create_access_token(user_id=user.id, org_id=active_mem.org_id, role=active_mem.role)
    refresh_token = create_refresh_token(user_id=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        org_id=active_mem.org_id,
        role=active_mem.role,
    )


@router.post("/refresh", response_model=TokenResponse, summary="Rotate Refresh Token")
async def refresh_token_endpoint(
    data: RefreshTokenRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    try:
        payload = decode_token(data.refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")

    user_id = payload.get("sub")
    mem_stmt = select(Membership).where(Membership.user_id == user_id)
    memberships = list((await session.execute(mem_stmt)).scalars().all())

    if not memberships:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active organization found.")

    active_mem = memberships[0]
    access_token = create_access_token(user_id=user_id, org_id=active_mem.org_id, role=active_mem.role)
    new_refresh = create_refresh_token(user_id=user_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user_id=user_id,
        org_id=active_mem.org_id,
        role=active_mem.role,
    )


@router.get("/me", response_model=UserProfileResponse, summary="Get Current User Profile")
async def get_me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserProfileResponse:
    mem_stmt = (
        select(Membership, Organization)
        .join(Organization, Membership.org_id == Organization.id)
        .where(Membership.user_id == user.id)
    )
    results = await session.execute(mem_stmt)
    mem_list = []
    for mem, org in results.all():
        mem_list.append({
            "org_id": org.id,
            "org_name": org.name,
            "org_slug": org.slug,
            "role": mem.role,
        })

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        memberships=mem_list,
    )
