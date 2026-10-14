from typing import Any, AsyncGenerator, Callable, Dict, List, Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import jwt

from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.security import decode_token, is_token_revoked, is_user_revoked
from backend.app.models.entities import Membership, Organization, User

security_scheme = HTTPBearer(auto_error=False)


class TenantContext:
    def __init__(self, user: User, organization: Organization, role: str, session: AsyncSession):
        self.user = user
        self.organization = organization
        self.org_id = organization.id
        self.role = role
        self.session = session


async def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(auth.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    if jti and await is_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    iat = payload.get("iat")
    if user_id and await is_user_revoked(user_id, iat):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked or invalidated. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(User).where(User.id == user_id, User.is_active == True)
    result = await session.execute(stmt)
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_tenant_context(
    auth: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
    session: AsyncSession = Depends(get_db_session),
) -> TenantContext:
    """
    Validates token, extracts tenant org_id, verifies active membership,
    and sets PostgreSQL Row-Level Security (RLS) context on the active transaction.
    """
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(auth.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    if jti and await is_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    org_id = payload.get("org_id")
    iat = payload.get("iat")

    if not user_id or not org_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user or tenant claim",
        )

    if await is_user_revoked(user_id, iat):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked or invalidated. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Fetch user
    user_stmt = select(User).where(User.id == user_id, User.is_active == True)
    user_res = await session.execute(user_stmt)
    user = user_res.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")

    # 2. Fetch membership for this organization
    mem_stmt = select(Membership).where(
        Membership.user_id == user_id,
        Membership.org_id == org_id,
    )
    mem_res = await session.execute(mem_stmt)
    membership = mem_res.scalars().first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: User is not a member of this organization",
        )

    # 3. Fetch organization
    org_stmt = select(Organization).where(Organization.id == org_id, Organization.is_active == True)
    org_res = await session.execute(org_stmt)
    organization = org_res.scalars().first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found or inactive")

    # 4. Set transaction-local PostgreSQL Row-Level Security context!
    await set_rls_tenant_context(session, org_id)

    return TenantContext(
        user=user,
        organization=organization,
        role=membership.role,
        session=session,
    )


def require_role(allowed_roles: List[str]) -> Callable:
    """Dependency factory checking that active tenant membership matches required roles."""
    async def role_checker(ctx: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        if ctx.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action requires one of the following roles: {', '.join(allowed_roles)} (current: {ctx.role})",
            )
        return ctx
    return role_checker
