from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
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
    is_user_revoked,
    revoke_token,
    verify_password,
)
from backend.app.models.entities import (
    AccessRequest,
    AuditLog,
    Membership,
    Organization,
    User,
    WorkspaceRequest,
)
from backend.app.providers.resend import ResendProvider

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
    is_superuser: bool = False
    memberships: List[Dict[str, Any]]


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    has_security_question: bool = False
    security_question: Optional[str] = None


class VerifyResetTokenRequest(BaseModel):
    token: str


class VerifyResetTokenResponse(BaseModel):
    valid: bool
    email: Optional[str] = None
    message: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, description="Minimum 8 characters")


class SecurityQuestionRecoverRequest(BaseModel):
    email: EmailStr
    security_answer: str
    new_password: str = Field(min_length=8, description="Minimum 8 characters")


class SetupSecurityQuestionRequest(BaseModel):
    security_question: str = Field(min_length=5)
    security_answer: str = Field(min_length=2)


def normalize_org_name(name: str) -> str:
    """Trim leading/trailing whitespace, collapse internal whitespace, and lowercase for duplicate checks."""
    return re.sub(r"\s+", " ", name.strip().lower())


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

    # 2. Check if organization already exists by normalized name
    norm_org_name = normalize_org_name(data.org_name)
    existing_org_stmt = select(Organization).where(Organization.normalized_name == norm_org_name)
    existing_org = (await session.execute(existing_org_stmt)).scalars().first()
    if existing_org:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organisation with these details already exists. If you belong to this organisation, contact its administrator or request access.",
        )

    # 3. Create User
    new_user = User(
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        is_active=True,
    )
    session.add(new_user)
    await session.flush()

    # 4. Create initial Organization
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
        name=data.org_name.strip(),
        normalized_name=norm_org_name,
        slug=slug,
        is_active=True,
    )
    session.add(new_org)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organisation with these details already exists. If you belong to this organisation, contact its administrator or request access.",
        )

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
        if user.is_superuser:
            first_org = (await session.execute(select(Organization).order_by(Organization.created_at.asc()))).scalars().first()
            default_org_id = first_org.id if first_org else "platform"
            access_token = create_access_token(user_id=user.id, org_id=default_org_id, role="super_admin")
            refresh_token = create_refresh_token(user_id=user.id)
            return TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                user_id=user.id,
                org_id=default_org_id,
                role="super_admin",
            )

        # Check pending workspace request (User Requirement 5)
        pending_ws = (await session.execute(
            select(WorkspaceRequest).where(WorkspaceRequest.user_id == user.id, WorkspaceRequest.status == "pending")
        )).scalars().first()
        if pending_ws:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"The Super Admin will be requested for your org creation and request will be approved in next 24hrs. Until and unless the Super Admin approves the account request, access to workspace '{pending_ws.proposed_name}' is not granted.",
            )

        # Check pending access request (User Requirement 6)
        pending_access = (await session.execute(
            select(AccessRequest).where(AccessRequest.user_id == user.id, AccessRequest.status == "pending")
        )).scalars().first()
        if pending_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organisation admin has been requested and your request will be reviewed and approved in next 24 hrs. Until and unless the Org Admin approves the account request, access to that organisation is not granted.",
            )

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
    if user_id and await is_user_revoked(user_id, payload.get("iat")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session has been revoked.")

    # Verify user exists and is active
    user_stmt = select(User).where(User.id == user_id, User.is_active == True)
    user = (await session.execute(user_stmt)).scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is deactivated or not found.")

    mem_stmt = select(Membership).where(Membership.user_id == user_id)
    memberships = list((await session.execute(mem_stmt)).scalars().all())

    if not memberships:
        if user.is_superuser:
            first_org = (await session.execute(select(Organization).order_by(Organization.created_at.asc()))).scalars().first()
            default_org_id = first_org.id if first_org else "platform"
            if jti:
                await revoke_token(jti, ttl_seconds=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)
            access_token = create_access_token(user_id=user_id, org_id=default_org_id, role="super_admin")
            new_refresh = create_refresh_token(user_id=user_id)
            return TokenResponse(
                access_token=access_token,
                refresh_token=new_refresh,
                user_id=user_id,
                org_id=default_org_id,
                role="super_admin",
            )
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
        is_superuser=user.is_superuser,
        memberships=mem_list,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse, summary="Request Password Reset Link (J5)")
async def forgot_password_endpoint(
    data: ForgotPasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> ForgotPasswordResponse:
    """
    Initiates password recovery via single-use SHA-256 token dispatched through Resend.
    Returns constant success response to prevent account enumeration.
    Includes security question challenge metadata if configured for the account.
    """
    clean_email = data.email.lower().strip()
    stmt = select(User).where(User.email == clean_email)
    user = (await session.execute(stmt)).scalars().first()

    has_sq = False
    sq_text = None

    if user and user.is_active:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)

        user.reset_token_hash = token_hash
        user.reset_token_expires_at = expires_at
        session.add(user)
        await session.commit()

        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        resend = ResendProvider()
        await resend.send_password_reset_email(to_email=user.email, reset_link=reset_link)

        if user.security_question:
            has_sq = True
            sq_text = user.security_question

    return ForgotPasswordResponse(
        message="If that email is registered and active, password reset instructions have been sent.",
        has_security_question=has_sq,
        security_question=sq_text,
    )


@router.post("/verify-reset-token", response_model=VerifyResetTokenResponse, summary="Validate Reset Token (J5)")
async def verify_reset_token_endpoint(
    data: VerifyResetTokenRequest,
    session: AsyncSession = Depends(get_db_session),
) -> VerifyResetTokenResponse:
    """Verifies validity and expiration of a password reset token without consuming it."""
    token_hash = hashlib.sha256(data.token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    stmt = select(User).where(
        User.reset_token_hash == token_hash,
        User.reset_token_expires_at > now,
        User.is_active == True,
    )
    user = (await session.execute(stmt)).scalars().first()
    if not user:
        return VerifyResetTokenResponse(
            valid=False,
            email=None,
            message="Password reset link is invalid or has expired.",
        )
    return VerifyResetTokenResponse(
        valid=True,
        email=user.email,
        message="Token is valid.",
    )


@router.post("/reset-password", summary="Execute Password Reset (J5)")
async def reset_password_endpoint(
    data: ResetPasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, str]:
    """
    Consumes a single-use SHA-256 token, updates password hash, revokes token,
    and logs an immutable security audit event.
    """
    token_hash = hashlib.sha256(data.token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    stmt = select(User).options(selectinload(User.memberships)).where(
        User.reset_token_hash == token_hash,
        User.reset_token_expires_at > now,
        User.is_active == True,
    )
    user = (await session.execute(stmt)).scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset token is invalid or has expired.",
        )

    user.hashed_password = hash_password(data.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    session.add(user)

    client_ip = request.client.host if request.client else None
    if user.memberships:
        target_org_id = user.memberships[0].org_id
        await set_rls_tenant_context(session, target_org_id)
        audit = AuditLog(
            org_id=target_org_id,
            user_id=user.id,
            action="auth.password_reset",
            entity_type="user",
            entity_id=user.id,
            details={"method": "email_token"},
            ip_address=client_ip,
        )
        session.add(audit)

    await session.commit()
    return {"message": "Password has been successfully reset. You may now log in with your new password."}


@router.post("/security-question-recover", summary="Recover Password via Security Question (J5)")
async def security_question_recover_endpoint(
    data: SecurityQuestionRecoverRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, str]:
    """
    Verifies user's security question answer hash and resets password.
    """
    clean_email = data.email.lower().strip()
    stmt = select(User).options(selectinload(User.memberships)).where(
        User.email == clean_email,
        User.is_active == True,
    )
    user = (await session.execute(stmt)).scalars().first()
    if not user or not user.security_answer_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid security credentials or security question not configured.",
        )

    normalized_answer = data.security_answer.strip().lower()
    if not verify_password(normalized_answer, user.security_answer_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect security question answer.",
        )

    user.hashed_password = hash_password(data.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    session.add(user)

    client_ip = request.client.host if request.client else None
    if user.memberships:
        target_org_id = user.memberships[0].org_id
        await set_rls_tenant_context(session, target_org_id)
        audit = AuditLog(
            org_id=target_org_id,
            user_id=user.id,
            action="auth.security_question_recovery",
            entity_type="user",
            entity_id=user.id,
            details={"method": "security_question"},
            ip_address=client_ip,
        )
        session.add(audit)

    await session.commit()
    return {"message": "Password successfully updated via security question recovery."}


@router.post("/security-question", summary="Set Security Question (Authenticated User)")
async def setup_security_question_endpoint(
    data: SetupSecurityQuestionRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Dict[str, str]:
    """Enables authenticated users to set or update their security recovery question."""
    user.security_question = data.security_question.strip()
    user.security_answer_hash = hash_password(data.security_answer.strip().lower())
    session.add(user)
    await session.commit()
    return {"message": "Security question successfully configured."}
