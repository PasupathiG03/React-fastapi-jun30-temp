import uuid
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from app.schemas.image_analysis import (
    ImageAnalysisResponse,
    MetricAssessment,
    ProcessingEligibility,
    QualityAssessment,
    QualityIssue,
    QualityMetrics,
)
from app.services.image_analysis import analyze_original_image
from app.services.image_quality import assess_image_quality

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/analyze",
    response_model=ImageAnalysisResponse,
    summary="Analyze Original Image & Assess Quality",
    description=(
        "Executes Step 1 (Original Image Analysis) and Step 3 (Image Quality Assessment). "
        "Evaluates resolution (≥ 1500px), sharpness, brightness, contrast, and visual usability "
        "without modifying the original image bytes."
    ),
)
async def analyze_product_image(
    file: UploadFile = File(..., description="Original product photograph to analyze"),
    min_width: Optional[int] = Query(None, ge=1, description="Minimum required width in px (default 1500)"),
    min_height: Optional[int] = Query(None, ge=1, description="Minimum required height in px (default 1500)"),
):
    image_id = str(uuid.uuid4())
    filename = Path(file.filename).name if file.filename else "product_image.jpg"

    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {e}",
        )

    if not content:
        # Return structured rejection for empty upload
        zero_metric = MetricAssessment(score=0.0, max_score=0.0, status="FAIL", details="No data")
        return ImageAnalysisResponse(
            success=False,
            image_id=image_id,
            analysis=None,
            quality_assessment=QualityAssessment(
                overall_score=0,
                quality_category="Poor",
                status="REJECTED",
                metrics=QualityMetrics(
                    resolution=zero_metric,
                    sharpness=zero_metric,
                    brightness=zero_metric,
                    contrast=zero_metric,
                    visibility=zero_metric,
                ),
                issues=[
                    QualityIssue(
                        code="EMPTY_FILE",
                        message="Uploaded file is empty.",
                        details="Received 0 bytes.",
                        recommendation="Please select and upload a valid image file.",
                        severity="CRITICAL",
                    )
                ],
                recommendations=["Please select and upload a valid image file."],
            ),
            processing_eligibility=ProcessingEligibility(
                eligible=False,
                next_step="IMAGE_REUPLOAD_REQUIRED",
            ),
        )

    # Step 1: Original Image Analysis
    try:
        analysis_data = analyze_original_image(content, filename=filename)
    except ValueError as val_err:
        err_msg = str(val_err)
        is_format_err = "Unsupported image format" in err_msg
        code = "UNSUPPORTED_FORMAT" if is_format_err else "CORRUPTED_IMAGE"
        rec = (
            "Upload an image in JPEG, PNG, WEBP, TIFF or BMP format."
            if is_format_err
            else "Ensure the image file is intact and not corrupted."
        )

        zero_metric = MetricAssessment(score=0.0, max_score=0.0, status="FAIL", details=err_msg)
        return ImageAnalysisResponse(
            success=False,
            image_id=image_id,
            analysis=None,
            quality_assessment=QualityAssessment(
                overall_score=0,
                quality_category="Poor",
                status="REJECTED",
                metrics=QualityMetrics(
                    resolution=zero_metric,
                    sharpness=zero_metric,
                    brightness=zero_metric,
                    contrast=zero_metric,
                    visibility=zero_metric,
                ),
                issues=[
                    QualityIssue(
                        code=code,
                        message=err_msg,
                        details=err_msg,
                        recommendation=rec,
                        severity="CRITICAL",
                    )
                ],
                recommendations=[rec],
            ),
            processing_eligibility=ProcessingEligibility(
                eligible=False,
                next_step="IMAGE_REUPLOAD_REQUIRED",
            ),
        )
    except Exception as exc:
        logger.error(f"Unexpected error during image analysis for {filename}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image analysis error: {exc}",
        )

    # Step 3: Image Quality Assessment
    quality_result = assess_image_quality(
        analysis_data,
        min_width=min_width,
        min_height=min_height,
    )

    # Determine eligibility and next processing phase
    if quality_result.status == "REJECTED":
        eligible = False
        next_step = "IMAGE_REUPLOAD_REQUIRED"
    elif quality_result.status == "WARNING":
        eligible = (quality_result.overall_score >= 70)
        next_step = "READY_FOR_IMAGE_PROCESSING" if eligible else "MANUAL_REVIEW_RECOMMENDED"
    else:
        eligible = True
        next_step = "READY_FOR_IMAGE_PROCESSING"

    eligibility = ProcessingEligibility(
        eligible=eligible,
        next_step=next_step,
    )

    return ImageAnalysisResponse(
        success=True,
        image_id=image_id,
        analysis=analysis_data,
        quality_assessment=quality_result,
        processing_eligibility=eligibility,
    )

