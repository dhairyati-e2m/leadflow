import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
from typing import Any, Dict, Optional, Set
import uuid

from cryptography.fernet import Fernet, InvalidToken
import jwt

from backend.app.core.config import settings


_CONSUMED_NONCES_MEM: Set[str] = set()


def _get_encryption_key() -> bytes:
    """
    Derives a deterministic, 32-byte URL-safe base64 Fernet key.
    Prioritizes CRM_ENCRYPTION_KEY if set, otherwise derives from SECRET_KEY.
    Guarantees authenticated symmetric encryption without plaintext leaks.
    """
    raw_key = settings.CRM_ENCRYPTION_KEY
    if raw_key:
        try:
            # Check if raw_key is already a valid 32-byte base64-encoded Fernet key
            decoded = base64.urlsafe_b64decode(raw_key.encode("utf-8"))
            if len(decoded) == 32:
                return raw_key.encode("utf-8")
        except Exception:
            pass
        # Derive 32-byte digest from the provided key string
        digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)

    # Deterministic fallback derivation from application SECRET_KEY
    digest = hashlib.sha256(f"leadflow_crm_fernet:{settings.SECRET_KEY}".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet() -> Fernet:
    """Returns an authenticated Fernet cipher instance."""
    return Fernet(_get_encryption_key())


def encrypt_credentials(data: Dict[str, Any]) -> str:
    """
    Encrypts sensitive credentials payload with authenticated symmetric encryption (Fernet/AES-128-CBC + HMAC-SHA256).
    Returns URL-safe ciphertext string.
    """
    payload_bytes = json.dumps(data, sort_keys=True).encode("utf-8")
    cipher = get_fernet()
    encrypted = cipher.encrypt(payload_bytes)
    return encrypted.decode("utf-8")


def decrypt_credentials(ciphertext: str) -> Dict[str, Any]:
    """
    Decrypts authenticated ciphertext and parses the JSON credentials dictionary.
    Raises ValueError on tampering, corruption, or invalid key.
    """
    if not ciphertext:
        raise ValueError("Empty ciphertext provided for decryption")

    cipher = get_fernet()
    try:
        decrypted_bytes = cipher.decrypt(ciphertext.encode("utf-8"))
        return json.loads(decrypted_bytes.decode("utf-8"))
    except (InvalidToken, json.JSONDecodeError, Exception) as exc:
        raise ValueError(f"Failed to decrypt credentials: invalid or tampered ciphertext ({str(exc)})") from exc


def generate_oauth_state(
    user_id: str,
    org_id: str,
    ttl_minutes: int = 10,
    portal_id: Optional[str] = None,
) -> str:
    """
    Generates a cryptographically signed OAuth state JWT bound to initiating user and organization.
    Includes unique nonce and short-lived expiration for CSRF and replay defense.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ttl_minutes)

    payload: Dict[str, Any] = {
        "sub": user_id,
        "org_id": org_id,
        "type": "hubspot_oauth_state",
        "nonce": str(uuid.uuid4()),
        "portal_id": portal_id,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


async def validate_oauth_state(
    state: str,
    expected_user_id: Optional[str] = None,
    expected_org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Decodes and validates OAuth state JWT:
    1. Validates cryptographic signature and expiration.
    2. Rejects replayed nonces.
    3. Rejects mismatched user or organization context if expected values are supplied.
    """
    if not state:
        raise ValueError("Missing OAuth state parameter")

    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("OAuth state has expired. Please initiate connection again.") from exc
    except jwt.PyJWTError as exc:
        raise ValueError(f"Invalid OAuth state signature: {str(exc)}") from exc

    if payload.get("type") != "hubspot_oauth_state":
        raise ValueError("Invalid OAuth state token type")

    nonce = payload.get("nonce")
    if not nonce:
        raise ValueError("OAuth state missing cryptographic nonce")

    # Anti-replay check
    if nonce in _CONSUMED_NONCES_MEM:
        raise ValueError("OAuth state has already been used (replay detected)")

    # Record nonce as consumed
    _CONSUMED_NONCES_MEM.add(nonce)

    # Check against Redis if available
    try:
        from backend.app.workers.arq_pool import get_arq_redis_pool
        redis = await get_arq_redis_pool()
        redis_key = f"oauth:state:nonce:{nonce}"
        exists = await redis.get(redis_key)
        if exists:
            raise ValueError("OAuth state has already been used (replay detected via Redis)")
        await redis.setex(redis_key, 3600, "1")
    except ValueError:
        raise
    except Exception:
        # Memory set serves as reliable in-process fallback
        pass

    if expected_user_id and payload.get("sub") != expected_user_id:
        raise ValueError("Mismatched OAuth user context")

    if expected_org_id and payload.get("org_id") != expected_org_id:
        raise ValueError("Mismatched OAuth organization context")

    return payload
