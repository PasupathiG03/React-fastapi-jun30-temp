from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.bigbasket.google_drive import GoogleDriveService

router = APIRouter()


class DriveVerifyRequest(BaseModel):
    folder_url: str


@router.post("/verify")
async def verify_drive_folder(
    payload: DriveVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    result = await GoogleDriveService.verify_folder_access(payload.folder_url)
    return result

