from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import authenticate_token, get_current_user, get_db
from app.core.ratelimit import SlidingWindowLimiter
from app.core.security import DUMMY_HASH, hash_password, verify_password
from app.core.session import clear_session_cookie, set_session_cookie
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, LoginResponse
from app.schemas.user import UserOut

router = APIRouter()

ip_limiter = SlidingWindowLimiter(settings.LOGIN_ATTEMPTS_PER_IP, settings.LOGIN_WINDOW_SECONDS)

# Same wording whether the username is unknown, the password is wrong or the account is inactive.
INVALID_LOGIN = "Invalid username or password"

DEFAULT_PASSWORD = "Admin@123#"


def _too_many(seconds: int) -> HTTPException:
    minutes = max(1, -(-seconds // 60))
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many sign-in attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        headers={"Retry-After": str(seconds)},
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    wait = ip_limiter.hit(client_ip)
    if wait:
        raise _too_many(wait)

    # Case-insensitive match so "mah001" finds stored "MAH001"
    user: User | None = (
        db.query(User).filter(func.lower(User.employee_id) == payload.employee_id.lower()).first()
    )

    now = datetime.now(timezone.utc)
    if user and user.locked_until and user.locked_until > now:
        raise _too_many(int((user.locked_until - now).total_seconds()) + 1)

    # Always run one password check, so an unknown username takes as long as a wrong password.
    password_ok = verify_password(payload.password, user.hashed_password if user else DUMMY_HASH)

    if not user or not user.is_active or not password_ok:
        if user and user.is_active:
            user.failed_attempts = (user.failed_attempts or 0) + 1
            if user.failed_attempts >= settings.MAX_FAILED_LOGINS:
                user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
                user.failed_attempts = 0
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_LOGIN,
            headers={"WWW-Authenticate": "Bearer"},
        )

    user.failed_attempts = 0
    user.locked_until = None
    db.commit()
    set_session_cookie(response, user.employee_id, user.token_version or 0)
    return LoginResponse(
        idle_minutes=settings.SESSION_IDLE_MINUTES,
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """End the session for real: every token issued so far stops working, then the cookie is removed."""
    user = authenticate_token(db, request.cookies.get(settings.COOKIE_NAME))
    if user:
        user.token_version = (user.token_version or 0) + 1
        db.commit()
    clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match")

    if not verify_password(payload.old_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect old password")

    if payload.new_password == payload.old_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The new password must be different from the old one")
    if payload.new_password == DEFAULT_PASSWORD or payload.new_password.lower() == current_user.employee_id.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please choose a password that is not the default or your username")

    current_user.hashed_password = hash_password(payload.new_password)
    current_user.token_version = (current_user.token_version or 0) + 1  # signs out every other device
    db.commit()
    clear_session_cookie(response)  # the user signs in again with the new password
