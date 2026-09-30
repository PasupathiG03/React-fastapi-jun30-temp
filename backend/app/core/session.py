from datetime import datetime, timezone

from fastapi import Response

from app.core.config import settings
from app.core.security import create_access_token


def set_session_cookie(response: Response, employee_id: str, token_version: int, auth_time: int | None = None) -> None:
    token = create_access_token(employee_id, token_version, auth_time)
    from jose import jwt  # read our own token back to size the cookie exactly like the token

    exp = jwt.get_unverified_claims(token)["exp"]
    max_age = max(1, int(exp - datetime.now(timezone.utc).timestamp()))
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,  # not readable by page scripts, so an XSS bug cannot steal the session
        secure=settings.cookie_secure,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.COOKIE_NAME,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,
    )
