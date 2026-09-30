from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

MAX_PASSWORD_BYTES = 72  # bcrypt only looks at the first 72 bytes and errors on more


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    raw = plain.encode()
    if len(raw) > MAX_PASSWORD_BYTES:
        return False  # can never match a stored bcrypt hash; do not crash
    try:
        return bcrypt.checkpw(raw, hashed.encode())
    except ValueError:
        return False


# A real hash to compare against when the username does not exist, so the response takes the same
# time either way and cannot be used to discover which usernames are real.
DUMMY_HASH = hash_password("not-a-real-password-for-timing-only")


def create_access_token(employee_id: str, token_version: int = 0, auth_time: Optional[int] = None) -> str:
    """A session token. It expires after the idle window, but never later than the absolute limit counted
    from the original sign-in (`auth_time`), so a session can be renewed while in use yet not forever."""
    now = datetime.now(timezone.utc)
    auth_time = auth_time or int(now.timestamp())
    absolute_end = datetime.fromtimestamp(auth_time, tz=timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    expire = min(now + timedelta(minutes=settings.SESSION_IDLE_MINUTES), absolute_end)
    payload = {"sub": employee_id, "ver": token_version, "auth": auth_time, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Return the token claims ({"sub", "ver", ...}), or None if the token is invalid or expired."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    return payload if payload.get("sub") else None
