"""Image Automation settings stored in the app_settings table.

There are no built-in values: a setting exists only once a user saves it on the Settings screen
(Image Automation > Settings). Until then reads return is_configured=False, and the features that need it
refuse to run with SettingsNotConfigured instead of guessing a value.
"""

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.app_setting import IMAGE_VALIDATION_SETTING, OUTPUT_PRESET_SETTING, AppSetting

_SIDES = ("top", "bottom", "left", "right")


class SettingsNotConfigured(Exception):
    """A required Image Automation setting has not been saved yet."""


def _get_row(db: Session, key: str) -> Optional[AppSetting]:
    return db.query(AppSetting).filter(AppSetting.key == key).first()


def _set_value(db: Session, key: str, value: Dict[str, Any]) -> None:
    row = _get_row(db, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value
    db.commit()


# ---- Validation resolution (minimum upload size) ---------------------------------------------------------

def get_image_validation_settings(db: Session) -> Dict[str, Any]:
    """Minimum upload resolution, or None values with is_configured=False when not saved yet."""
    row = _get_row(db, IMAGE_VALIDATION_SETTING)
    value = (row.value if row else None) or {}
    try:
        min_width = int(value["min_width"])
        min_height = int(value["min_height"])
        configured = True
    except (KeyError, TypeError, ValueError):
        min_width = min_height = None
        configured = False
    return {
        "min_width": min_width,
        "min_height": min_height,
        "is_configured": configured,
        "updated_at": row.updated_at if row else None,
    }


def require_image_validation_settings(db: Session) -> Dict[str, Any]:
    s = get_image_validation_settings(db)
    if not s["is_configured"]:
        raise SettingsNotConfigured(
            "The minimum image resolution is not configured. "
            "Set it in Image Automation > Settings > Validation Resolution Dimensions."
        )
    return s


def set_image_validation_settings(db: Session, min_width: int, min_height: int) -> Dict[str, Any]:
    _set_value(db, IMAGE_VALIDATION_SETTING, {"min_width": int(min_width), "min_height": int(min_height)})
    return get_image_validation_settings(db)


# ---- Output preset (canvas, DPI, FOP/BOP padding) --------------------------------------------------------

def get_output_preset(db: Session) -> Dict[str, Any]:
    """Canvas size, DPI and FOP/BOP padding for new batches, or None values when not saved yet."""
    row = _get_row(db, OUTPUT_PRESET_SETTING)
    value = (row.value if row else None) or {}
    try:
        pad = value["padding"]
        preset = {
            "canvas_width": int(value["canvas_width"]),
            "canvas_height": int(value["canvas_height"]),
            "dpi": int(value["dpi"]),
            "padding": {k: int(pad[k]) for k in _SIDES},
        }
        configured = True
    except (KeyError, TypeError, ValueError):
        preset = {"canvas_width": None, "canvas_height": None, "dpi": None, "padding": None}
        configured = False
    preset["is_configured"] = configured
    preset["updated_at"] = row.updated_at if row else None
    return preset


def require_output_preset(db: Session) -> Dict[str, Any]:
    p = get_output_preset(db)
    if not p["is_configured"]:
        raise SettingsNotConfigured(
            "The output preset is not configured. Set it in Image Automation > Settings > Output Preset."
        )
    return p


def set_output_preset(db: Session, preset: Dict[str, Any]) -> Dict[str, Any]:
    value = {
        "canvas_width": int(preset["canvas_width"]),
        "canvas_height": int(preset["canvas_height"]),
        "dpi": int(preset["dpi"]),
        "padding": {k: int(preset["padding"][k]) for k in _SIDES},
    }
    _set_value(db, OUTPUT_PRESET_SETTING, value)
    return get_output_preset(db)
