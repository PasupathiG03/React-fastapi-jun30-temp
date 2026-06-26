from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_superuser
from app.models.role import Role
from app.schemas.role import RoleCreate, RoleOut, RoleUpdate

router = APIRouter()

@router.get("/", response_model=List[RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """List all active roles."""
    return db.query(Role).filter(Role.is_active == True).order_by(Role.id.desc()).all()


@router.post("/", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
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
    _=Depends(get_superuser),
):
    """Update a role."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

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
    _=Depends(get_superuser),
):
    """Soft delete a role by setting is_active to False."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        
    role.is_active = False
    db.commit()
