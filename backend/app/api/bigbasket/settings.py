from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.builtin_screens import STUDIO_MAIN_SCREEN, STUDIO_SETTINGS_SCREEN
from app.core.dependencies import get_db, require_screen
from app.schemas.app_setting import (
    ImageValidationSettingsOut,
    ImageValidationSettingsUpdate,
    OutputPresetOut,
    OutputPresetUpdate,
)
from app.services.app_settings import (
    get_image_validation_settings,
    get_output_preset,
    set_image_validation_settings,
    set_output_preset,
)

router = APIRouter()


@router.get("/image-validation", response_model=ImageValidationSettingsOut)
def read_image_validation_settings(
    db: Session = Depends(get_db),
    # Image Studio reads these to validate uploads, so either screen may read them.
    user=Depends(require_screen(STUDIO_MAIN_SCREEN, STUDIO_SETTINGS_SCREEN)),
):
    return get_image_validation_settings(db)


@router.put("/image-validation", response_model=ImageValidationSettingsOut)
def update_image_validation_settings(
    payload: ImageValidationSettingsUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_screen(STUDIO_SETTINGS_SCREEN)),
):
    return set_image_validation_settings(db, payload.min_width, payload.min_height)


@router.get("/output-preset", response_model=OutputPresetOut)
def read_output_preset(
    db: Session = Depends(get_db),
    # Image Studio shows the preset when creating a batch, so either screen may read it.
    user=Depends(require_screen(STUDIO_MAIN_SCREEN, STUDIO_SETTINGS_SCREEN)),
):
    return get_output_preset(db)


@router.put("/output-preset", response_model=OutputPresetOut)
def update_output_preset(
    payload: OutputPresetUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_screen(STUDIO_SETTINGS_SCREEN)),
):
    return set_output_preset(db, payload.model_dump())
