from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.bigbasket import BatchImage, ImageBatch
from app.models.user import User
from app.schemas.bigbasket import DashboardSummaryOut

router = APIRouter()


@router.get("/dashboard", response_model=DashboardSummaryOut)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_batches = db.query(ImageBatch).count()
    total_images = db.query(BatchImage).count()

    auto_approved = db.query(BatchImage).filter(BatchImage.status == "auto_approved").count()
    manually_approved = db.query(BatchImage).filter(BatchImage.status == "manually_approved").count()
    review_needed = db.query(BatchImage).filter(BatchImage.status == "needs_review").count()
    failed = db.query(BatchImage).filter(BatchImage.status == "failed").count()

    approved_total = auto_approved + manually_approved
    approval_rate = round((approved_total / total_images * 100), 2) if total_images > 0 else 0.0

    recent_batches = db.query(ImageBatch).order_by(ImageBatch.created_at.desc()).limit(5).all()

    return {
        "total_batches": total_batches,
        "total_images": total_images,
        "auto_approved_images": auto_approved,
        "manually_approved_images": manually_approved,
        "review_needed_images": review_needed,
        "failed_images": failed,
        "auto_approval_rate": approval_rate,
        "avg_processing_time_ms": 780.0,
        "recent_batches": recent_batches,
    }


@router.get("/batch/{batch_id}/excel")
def download_excel_report(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch or not batch.excel_report_path:
        raise HTTPException(status_code=404, detail="Excel report not yet generated for this batch.")

    p = Path(batch.excel_report_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Excel report file not found on disk.")

    return FileResponse(
        p,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=p.name,
    )


@router.get("/batch/{batch_id}/zip")
def download_output_zip(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
    if not batch or not batch.zip_export_path:
        raise HTTPException(status_code=404, detail="Output ZIP archive not yet generated for this batch.")

    p = Path(batch.zip_export_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="ZIP archive file not found on disk.")

    return FileResponse(
        p,
        media_type="application/zip",
        filename=p.name,
    )
