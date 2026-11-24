from sqlalchemy import JSON, Column, Integer, String

from app.core.database import Base
from app.models.user import AuditMixin

# Keys of the settings stored in app_settings. One row per key; its value is a JSON object.
IMAGE_VALIDATION_SETTING = "image_validation"
OUTPUT_PRESET_SETTING = "output_preset"
BG_REMOVAL_MODEL_SETTING = "bg_removal_model"


class AppSetting(AuditMixin, Base):
    """An application setting edited from a Settings screen, stored as one JSON value per key."""

    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(JSON, nullable=False)

    def __repr__(self) -> str:
        return f"<AppSetting key={self.key!r}>"
