from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, has_full_access, is_developer_role, require_screen
from app.core.builtin_screens import USER_SCREEN
from app.models.role import Role
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.core.config import settings
from app.core.security import hash_password

router = APIRouter()

DEFAULT_PASSWORD = settings.DEFAULT_PASSWORD


def _protect_superusers(db: Session, actor: User, target: User | None, data: dict) -> None:
    """A role that only has the User Management screen must not be able to gain or remove full access:
    it cannot change a superuser or Developer account, make anyone a superuser, or give anyone the
    Developer role (including itself)."""
    if has_full_access(actor):
        return
    if target is not None and has_full_access(target):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a Developer can change a Developer or superuser account")
    if data.get("is_superuser"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a Developer can grant superuser access")
    role_id = data.get("role_id")
    if role_id is not None and is_developer_role(db.query(Role).filter(Role.id == role_id).first()):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a Developer can give the Developer role")


@router.get("/", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _=Depends(require_screen(USER_SCREEN)),
):
    """List all users (superusers, and roles that were given the User Management screen)."""
    return db.query(User).filter(User.is_active == True).order_by(User.id.desc()).all()


@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_screen(USER_SCREEN)),
):
    """Create a new user (superusers, and roles that were given the User Management screen)."""
    _protect_superusers(db, current_user, None, payload.model_dump())
    existing_user = db.query(User).filter(User.employee_id == payload.employee_id).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this employee ID already exists",
        )
    
    user_data = payload.model_dump()
    user_data["hashed_password"] = hash_password(DEFAULT_PASSWORD)

    user = User(**user_data)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_screen(USER_SCREEN)),
):
    """Update a user (superusers, and roles that were given the User Management screen)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _protect_superusers(db, current_user, user, payload.model_dump(exclude_unset=True))

    if payload.employee_id and payload.employee_id != user.employee_id:
        existing_user = db.query(User).filter(User.employee_id == payload.employee_id).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this employee ID already exists",
            )

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    if update_data.get("is_active") is False:
        user.token_version = (user.token_version or 0) + 1  # end any session this user still has

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_screen(USER_SCREEN)),
):
    """Soft delete a user by setting is_active to False."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _protect_superusers(db, current_user, user, {})
        
    user.is_active = False
    user.token_version = (user.token_version or 0) + 1
    db.commit()
