from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, has_full_access, is_developer_role, require_screen
from app.core.builtin_screens import USER_SCREEN
from app.models.role import Role
from app.models.user import User
from app.schemas.user import (
    BulkImportResult,
    BulkImportRowResult,
    BulkUserInput,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.core.config import settings
from app.core.security import hash_password

MAX_BULK_IMPORT_ROWS = 500

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
    """List every user, active and inactive (superusers, and roles that were given the User Management
    screen). Deactivating someone here is reversible, so they stay visible -- just flagged Inactive --
    instead of disappearing from the screen that's meant to manage them."""
    return db.query(User).order_by(User.is_active.desc(), User.id.desc()).all()


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


@router.post("/bulk-import", response_model=BulkImportResult)
def bulk_import_users(
    payload: List[BulkUserInput],
    db: Session = Depends(get_db),
    current_user=Depends(require_screen(USER_SCREEN)),
):
    """Create many users at once (e.g. from an imported spreadsheet). Each row succeeds or fails on its
    own -- one bad row (duplicate id, unknown role, validation error) does not roll back the others. All
    created users get the same default password as a single Add User would."""
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows to import")
    if len(payload) > MAX_BULK_IMPORT_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Import is limited to {MAX_BULK_IMPORT_ROWS} rows at a time",
        )

    active_roles = {r.name.strip().lower(): r for r in db.query(Role).filter(Role.is_active == True).all()}
    seen_ids: set[str] = set()
    rows_out: List[BulkImportRowResult] = []
    created = 0

    for idx, row in enumerate(payload, start=1):
        try:
            role_id = None
            if row.role_name and row.role_name.strip():
                role = active_roles.get(row.role_name.strip().lower())
                if role is None:
                    raise ValueError(f"Role '{row.role_name}' was not found")
                role_id = role.id

            # Reuses UserCreate's own field validation (employee_id format, name/location charset).
            candidate = UserCreate(
                employee_id=row.employee_id,
                employee_name=row.employee_name,
                location=row.location,
                role_id=role_id,
            )

            if candidate.employee_id in seen_ids:
                raise ValueError("Duplicate employee ID earlier in this file")

            _protect_superusers(db, current_user, None, candidate.model_dump())

            existing_user = db.query(User).filter(User.employee_id == candidate.employee_id).first()
            if existing_user:
                raise ValueError("A user with this employee ID already exists")

            user_data = candidate.model_dump()
            user_data["hashed_password"] = hash_password(DEFAULT_PASSWORD)
            user = User(**user_data)
            db.add(user)
            db.commit()

            seen_ids.add(candidate.employee_id)
            created += 1
            rows_out.append(BulkImportRowResult(row=idx, employee_id=candidate.employee_id, status="created"))
        except ValidationError as exc:
            db.rollback()
            message = exc.errors()[0]["msg"] if exc.errors() else "Invalid row"
            rows_out.append(BulkImportRowResult(row=idx, employee_id=row.employee_id, status="error", message=message))
        except HTTPException as exc:
            db.rollback()
            rows_out.append(BulkImportRowResult(row=idx, employee_id=row.employee_id, status="error", message=str(exc.detail)))
        except ValueError as exc:
            db.rollback()
            rows_out.append(BulkImportRowResult(row=idx, employee_id=row.employee_id, status="error", message=str(exc)))

    return BulkImportResult(created=created, failed=len(rows_out) - created, rows=rows_out)


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
