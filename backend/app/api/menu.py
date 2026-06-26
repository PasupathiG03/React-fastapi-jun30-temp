from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, get_superuser
from app.models.menu import Menu
from app.schemas.menu import MenuCreate, MenuOut, MenuUpdate, MenuReorderItem

router = APIRouter()


@router.get("/", response_model=List[MenuOut])
def list_menus(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return (
        db.query(Menu)
        .filter(Menu.is_active == True, Menu.status == False)
        .order_by(Menu.order, Menu.id)
        .all()
    )


@router.get("/all", response_model=List[MenuOut])
def list_all_menus(
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Return all menus including inactive ones (superuser only)."""
    return db.query(Menu).filter(Menu.status == False).order_by(Menu.order, Menu.id).all()


@router.post("/", response_model=MenuOut, status_code=status.HTTP_201_CREATED)
def create_menu(
    payload: MenuCreate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    existing = db.query(Menu).filter(Menu.url == payload.url).first()
    if existing:
        if existing.status:
            existing.status = False
            existing.name = payload.name
            existing.icon = payload.icon
            existing.order = payload.order
            db.commit()
            db.refresh(existing)
            return existing
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A menu with this URL already exists",
        )
    menu = Menu(**payload.model_dump())
    db.add(menu)
    db.commit()
    db.refresh(menu)
    return menu


@router.put("/reorder", status_code=status.HTTP_200_OK)
def reorder_menus(
    payload: List[MenuReorderItem],
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Bulk update the order of menus."""
    for item in payload:
        db.query(Menu).filter(Menu.id == item.id).update({"order": item.order})
    db.commit()
    return {"message": "Reordered successfully"}


@router.put("/{menu_id}", response_model=MenuOut)
def update_menu(
    menu_id: int,
    payload: MenuUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    menu = db.query(Menu).filter(Menu.id == menu_id).first()
    if not menu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(menu, field, value)

    db.commit()
    db.refresh(menu)
    return menu


@router.delete("/{menu_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_menu(
    menu_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    menu = db.query(Menu).filter(Menu.id == menu_id).first()
    if not menu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu not found")

    menu.status = True
    db.commit()
