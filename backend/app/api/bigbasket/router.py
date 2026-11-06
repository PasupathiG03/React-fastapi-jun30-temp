from fastapi import APIRouter

from app.api.bigbasket import (
    batches,
    events,
    google_drive,
    images,
    reports,
    reviews,
    uploads,
)

bigbasket_router = APIRouter()

bigbasket_router.include_router(batches.router, prefix="/batches", tags=["BigBasket Batches"])
bigbasket_router.include_router(uploads.router, prefix="/uploads", tags=["BigBasket Uploads"])
bigbasket_router.include_router(images.router, prefix="/images", tags=["BigBasket Images"])
bigbasket_router.include_router(reviews.router, prefix="/reviews", tags=["BigBasket Reviews"])
bigbasket_router.include_router(reports.router, prefix="/reports", tags=["BigBasket Reports"])
bigbasket_router.include_router(events.router, prefix="/events", tags=["BigBasket Events"])
bigbasket_router.include_router(google_drive.router, prefix="/google-drive", tags=["BigBasket Google Drive"])

