from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

# Bounds for the minimum upload resolution. Below 100 px nothing useful can be validated, and above
# 10000 px practically every catalog photo would be rejected.
MIN_DIMENSION = 100
MAX_DIMENSION = 10000


class ImageValidationSettingsUpdate(BaseModel):
    min_width: int = Field(ge=MIN_DIMENSION, le=MAX_DIMENSION)
    min_height: int = Field(ge=MIN_DIMENSION, le=MAX_DIMENSION)


class ImageValidationSettingsOut(BaseModel):
    # Null until a user saves the setting.
    min_width: Optional[int] = None
    min_height: Optional[int] = None
    is_configured: bool
    updated_at: Optional[datetime] = None


# Output preset bounds: the standardized canvas every processed image is rendered on.
MIN_CANVAS, MAX_CANVAS = 500, 6000
MIN_DPI, MAX_DPI = 72, 1200


class PaddingSettings(BaseModel):
    top: int = Field(ge=0)
    bottom: int = Field(ge=0)
    left: int = Field(ge=0)
    right: int = Field(ge=0)


class OutputPresetUpdate(BaseModel):
    canvas_width: int = Field(ge=MIN_CANVAS, le=MAX_CANVAS)
    canvas_height: int = Field(ge=MIN_CANVAS, le=MAX_CANVAS)
    dpi: int = Field(ge=MIN_DPI, le=MAX_DPI)
    padding: PaddingSettings

    @model_validator(mode="after")
    def padding_fits_canvas(self):
        # Leave at least a quarter of the canvas for the product itself.
        if self.padding.left + self.padding.right > self.canvas_width * 0.75:
            raise ValueError("Left + right padding must be at most 75% of the canvas width.")
        if self.padding.top + self.padding.bottom > self.canvas_height * 0.75:
            raise ValueError("Top + bottom padding must be at most 75% of the canvas height.")
        return self


class OutputPresetOut(BaseModel):
    # Null until a user saves the setting.
    canvas_width: Optional[int] = None
    canvas_height: Optional[int] = None
    dpi: Optional[int] = None
    padding: Optional[PaddingSettings] = None
    is_configured: bool
    updated_at: Optional[datetime] = None
