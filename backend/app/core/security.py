from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import uuid
import bcrypt
import jwt

from backend.app.core.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """Hashes a password with bcrypt and automatic unique salt."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    user_id: str,
    org_id: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Creates a short-lived signed JWT access token containing tenant context."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: Dict[str, Any] = {
        "sub": user_id,
        "org_id": org_id,
        "role": role,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(
    user_id: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Creates a signed refresh token for rotating credential renewal."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload: Dict[str, Any] = {
        "sub": user_id,
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """Decodes and validates JWT signature and expiration."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


_REVOKED_TOKENS_MEM: set = set()


async def revoke_token(jti: str, ttl_seconds: int = 3600) -> None:
    """Revokes a token identifier (jti) in Redis with fallback to in-memory set."""
    _REVOKED_TOKENS_MEM.add(jti)
    try:
        from backend.app.workers.arq_pool import get_arq_redis_pool
        redis = await get_arq_redis_pool()
        await redis.setex(f"token:revoked:{jti}", max(int(ttl_seconds), 60), "1")
    except Exception:
        pass


async def is_token_revoked(jti: str) -> bool:
    """Checks whether a token jti is revoked in Redis or in-memory set."""
    if jti in _REVOKED_TOKENS_MEM:
        return True
    try:
        from backend.app.workers.arq_pool import get_arq_redis_pool
        redis = await get_arq_redis_pool()
        val = await redis.get(f"token:revoked:{jti}")
        return val is not None
    except Exception:
        return False


_REVOKED_USERS_MEM: Dict[str, int] = {}


async def revoke_user_sessions(user_id: str, ttl_seconds: int = 86400 * 7) -> None:
    """Revokes all sessions/tokens issued for user_id before current timestamp."""
    now = int(datetime.now(timezone.utc).timestamp())
    _REVOKED_USERS_MEM[user_id] = now
    try:
        from backend.app.workers.arq_pool import get_arq_redis_pool
        redis = await get_arq_redis_pool()
        await redis.setex(f"user:revoked_before:{user_id}", ttl_seconds, str(now))
    except Exception:
        pass


async def is_user_revoked(user_id: str, iat: Optional[int]) -> bool:
    """Checks whether token with issued-at (iat) was issued before user session revocation."""
    if not iat:
        return False
    revoked_before = _REVOKED_USERS_MEM.get(user_id)
    if revoked_before and iat < revoked_before:
        return True
    try:
        from backend.app.workers.arq_pool import get_arq_redis_pool
        redis = await get_arq_redis_pool()
        val = await redis.get(f"user:revoked_before:{user_id}")
        if val is not None:
            cutoff = int(val)
            _REVOKED_USERS_MEM[user_id] = cutoff
            return iat < cutoff
    except Exception:
        pass
    return False

