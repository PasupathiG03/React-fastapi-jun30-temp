from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import ROLE_SCREEN, USER_SCREEN, get_db, require_screen
from app.models.role import Role
from app.schemas.role import RoleCreate, RoleOut, RoleUpdate

router = APIRouter()


def _protect_developer_role(actor, role: Role) -> None:
    """Only a superuser may change the Developer role (it carries full access)."""
    if role.name.strip().lower() == "developer" and not actor.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a superuser can change the Developer role")

@router.get("/", response_model=List[RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    # The User Management form also needs the role list for its "Role" dropdown.
    _=Depends(require_screen(ROLE_SCREEN, USER_SCREEN)),
):
    """List all active roles."""
    return db.query(Role).filter(Role.is_active == True).order_by(Role.id.desc()).all()


@router.post("/", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    _=Depends(require_screen(ROLE_SCREEN)),
):
    """Create a new role."""
    existing_role = db.query(Role).filter(Role.name == payload.name).first()
    if existing_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A role with this name already exists",
        )
    
    role = Role(**payload.model_dump())
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.put("/{role_id}", response_model=RoleOut)
def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_screen(ROLE_SCREEN)),
):
    """Update a role."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    _protect_developer_role(current_user, role)

    if payload.name and payload.name != role.name:
        existing_role = db.query(Role).filter(Role.name == payload.name).first()
        if existing_role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A role with this name already exists",
            )

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(role, key, value)
    
    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_screen(ROLE_SCREEN)),
):
    """Soft delete a role by setting is_active to False."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    _protect_developer_role(current_user, role)
        
    role.is_active = False
    db.commit()
