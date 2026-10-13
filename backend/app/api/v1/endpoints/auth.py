from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.deps import get_current_user, security_scheme
from backend.app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    is_token_revoked,
    revoke_token,
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
    org_id: Optional[str] = None  # Explicit organization target to preserve context


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


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
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")

    jti = payload.get("jti")
    if jti and await is_token_revoked(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked.")

    user_id = payload.get("sub")

    # Verify user exists and is active
    user_stmt = select(User).where(User.id == user_id, User.is_active == True)
    user = (await session.execute(user_stmt)).scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is deactivated or not found.")

    mem_stmt = select(Membership).where(Membership.user_id == user_id)
    memberships = list((await session.execute(mem_stmt)).scalars().all())

    if not memberships:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active organization found.")

    # Preserve requested org_id if specified and member, otherwise default to first
    active_mem = None
    if data.org_id:
        active_mem = next((m for m in memberships if m.org_id == data.org_id), None)
    if not active_mem:
        active_mem = memberships[0]

    # One-time rotation: revoke old refresh token jti
    if jti:
        await revoke_token(jti, ttl_seconds=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)

    access_token = create_access_token(user_id=user_id, org_id=active_mem.org_id, role=active_mem.role)
    new_refresh = create_refresh_token(user_id=user_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user_id=user_id,
        org_id=active_mem.org_id,
        role=active_mem.role,
    )


@router.post("/logout", status_code=status.HTTP_200_OK, summary="Revoke Tokens & End Session")
async def logout_endpoint(
    data: Optional[LogoutRequest] = None,
    auth: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
) -> Dict[str, str]:
    """Revokes active access token and refresh token in Redis."""
    # Revoke access token if present in Authorization header
    if auth and auth.credentials:
        try:
            payload = decode_token(auth.credentials)
            jti = payload.get("jti")
            exp = payload.get("exp", 0)
            now = int(datetime.now(timezone.utc).timestamp())
            ttl = max(exp - now, 60)
            if jti:
                await revoke_token(jti, ttl_seconds=ttl)
        except Exception:
            pass

    # Revoke refresh token if provided
    if data and data.refresh_token:
        try:
            payload = decode_token(data.refresh_token)
            jti = payload.get("jti")
            exp = payload.get("exp", 0)
            now = int(datetime.now(timezone.utc).timestamp())
            ttl = max(exp - now, 60)
            if jti:
                await revoke_token(jti, ttl_seconds=ttl)
        except Exception:
            pass

    return {"message": "Logged out successfully."}


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
