from datetime import datetime, timezone
from typing import Generator

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.context import set_current_user
from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.core.session import set_session_cookie

# auto_error=False: the browser sends the session cookie, the Authorization header is only a fallback for tools.
bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def authenticate_session(db: Session, token: str | None):
    """(user, token claims) for a valid session, or (None, None): bad/expired token, inactive user, revoked session."""
    from app.models.user import User

    if not token:
        return None, None
    claims = decode_access_token(token)
    if not claims:
        return None, None
    user = db.query(User).filter(User.employee_id == claims["sub"], User.is_active == True).first()
    if not user or int(claims.get("ver", 0)) != (user.token_version or 0):
        return None, None
    return user, claims


def authenticate_token(db: Session, token: str | None):
    return authenticate_session(db, token)[0]


async def get_current_user(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    token = request.cookies.get(settings.COOKIE_NAME) or (credentials.credentials if credentials else None)
    user, claims = authenticate_session(db, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Sliding session: while the user keeps working, push the idle expiry forward. This only happens once
    # less than half of the idle window is left, and never past the absolute limit (it keeps the original
    # sign-in time), so a session cannot be extended forever.
    remaining = claims["exp"] - datetime.now(timezone.utc).timestamp()
    if request.cookies.get(settings.COOKIE_NAME) and remaining < settings.SESSION_IDLE_MINUTES * 30:
        set_session_cookie(response, user.employee_id, user.token_version or 0, int(claims.get("auth", 0)) or None)

    set_current_user(user.id)
    return user


def get_superuser(current_user=Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superuser access required")
    return current_user


USER_SCREEN = "/access-control/user-management"
ROLE_SCREEN = "/access-control/role-management"
WORKFLOW_SCREEN = "/workflow-management"


def require_screen(*urls: str):
    """Allow superusers, and users whose role was granted at least one of these screens in Menu Access.
    This ties the API to the same permission that shows the screen in the sidebar, so a screen a role can open
    also works, while everything else stays closed."""

    def dependency(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
        from app.models.access import RoleMenuAccess
        from app.models.menu import Menu

        if current_user.is_superuser:
            return current_user
        allowed = (
            current_user.role_id is not None
            and db.query(RoleMenuAccess.id)
            .join(Menu, Menu.id == RoleMenuAccess.menu_id)
            .filter(
                RoleMenuAccess.role_id == current_user.role_id,
                Menu.url.in_(urls),
                Menu.is_active == True,
                Menu.status == False,
            )
            .first()
            is not None
        )
        if not allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this screen")
        return current_user

    return dependency
