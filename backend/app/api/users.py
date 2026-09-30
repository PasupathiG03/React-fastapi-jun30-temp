from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import USER_SCREEN, get_db, require_screen
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.core.security import hash_password

router = APIRouter()

DEFAULT_PASSWORD = "Admin@123#"


def _protect_superusers(actor: User, target: User, new_is_superuser) -> None:
    """A role that only has the User Management screen must not be able to gain or remove superuser power."""
    if actor.is_superuser:
        return
    if target.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a superuser can change a superuser account")
    if new_is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a superuser can grant superuser access")


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
    if payload.is_superuser and not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a superuser can create a superuser")
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
    _protect_superusers(current_user, user, payload.model_dump(exclude_unset=True).get("is_superuser"))

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
    _protect_superusers(current_user, user, None)
        
    user.is_active = False
    user.token_version = (user.token_version or 0) + 1
    db.commit()
