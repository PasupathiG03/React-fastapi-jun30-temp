from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user, get_db, get_superuser, has_full_access
from app.models.access import RoleMenuAccess
from app.models.menu import Menu
from app.models.process import Process
from app.core.builtin_screens import BUILT_IN_SCREENS, DEVELOPER_ONLY_SCREENS, ROUTER_SETUP_SCREEN
from app.schemas.menu import MenuCreate, MenuOut, MenuUpdate, MenuReorderItem

router = APIRouter()


@router.get("/", response_model=List[MenuOut])
def list_menus(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Sidebar screens, the only source the sidebar renders from. Developers (and superusers) see every
    screen; everyone else only the screens their role was granted in Menu Access, never developer-only ones."""
    # A screen whose process was deactivated is hidden with it (Router Setup only lists active processes).
    # Built-in screens stay visible, so a Developer can never lose Router Setup or Access Control that way.
    query = (
        db.query(Menu)
        .options(joinedload(Menu.process))
        .outerjoin(Process, Process.id == Menu.process_id)
        .filter(Menu.is_active == True, Menu.is_deleted == False)
        .filter(Menu.process_id.is_(None) | (Process.is_active == True) | (Menu.url == ROUTER_SETUP_SCREEN))
    )
    if not has_full_access(current_user):
        query = (
            query.join(RoleMenuAccess, RoleMenuAccess.menu_id == Menu.id)
            .filter(RoleMenuAccess.role_id == current_user.role_id)
            .filter(Menu.url.notin_(DEVELOPER_ONLY_SCREENS))
        )
    return query.order_by(Menu.order, Menu.id).all()


@router.get("/all", response_model=List[MenuOut])
def list_all_menus(
    process_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    """Return all menus including inactive ones (superuser only), optionally
    scoped to a single process (screens shown per-process in Developer Management)."""
    query = db.query(Menu).options(joinedload(Menu.process)).filter(Menu.is_deleted == False)
    if process_id is not None:
        query = query.filter(Menu.process_id == process_id)
    return query.order_by(Menu.order, Menu.id).all()


@router.post("/", response_model=MenuOut, status_code=status.HTTP_201_CREATED)
def create_menu(
    payload: MenuCreate,
    db: Session = Depends(get_db),
    _=Depends(get_superuser),
):
    existing = db.query(Menu).filter(Menu.url == payload.url).first()
    if existing:
        if existing.is_deleted:
            existing.is_deleted = False
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
    db.info.setdefault("live_kinds", set()).add("access")
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

    data = payload.model_dump(exclude_unset=True)
    if menu.url == ROUTER_SETUP_SCREEN:
        if "url" in data and data["url"] != menu.url:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The address of Router Setup cannot be changed")
        if data.get("is_active") is False or data.get("is_deleted") is True:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Router Setup cannot be deactivated or deleted")
    elif menu.url in BUILT_IN_SCREENS:
        if "url" in data and data["url"] != menu.url:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The address of a built-in screen cannot be changed")

    if "url" in data and data["url"] != menu.url:
        if data["url"] in BUILT_IN_SCREENS or db.query(Menu.id).filter(Menu.url == data["url"], Menu.id != menu.id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A menu with this URL already exists")

    for field, value in data.items():
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
    if menu.url == ROUTER_SETUP_SCREEN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Router Setup cannot be deleted")

    menu.is_deleted = True
    db.commit()
