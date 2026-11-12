from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field


class ImageCharacteristics(BaseModel):
    brightness_mean: float
    contrast_std: float
    sharpness_laplacian_var: float
    blur_level: str  # "Sharp" | "Slightly Blurry" | "Very Blurry"
    is_extremely_dark: bool
    is_overexposed: bool
    dark_pixel_ratio: float
    bright_pixel_ratio: float
    noise_level: float


class ProductPositionAnalysis(BaseModel):
    potential_foreground_detected: bool
    approximate_bbox: Optional[List[int]] = None  # [x, y, w, h]
    object_position: Optional[str] = None         # "Center", "Top-Left", etc.
    has_large_empty_regions: bool
    empty_region_ratio: float
    heuristic_note: str = (
        "Approximate heuristic localization; not guaranteed product segmentation."
    )


class ImageAnalysisData(BaseModel):
    filename: str
    format: str
    width: int
    height: int
    resolution_megapixels: float
    file_size_kb: float
    aspect_ratio: str
    orientation: str
    color_mode: str
    dpi: Optional[Tuple[float, float]] = None
    exif: Optional[Dict[str, Any]] = None
    characteristics: Optional[ImageCharacteristics] = None
    product_position: Optional[ProductPositionAnalysis] = None


class MetricAssessment(BaseModel):
    score: float
    max_score: float
    status: str  # "PASS" | "WARNING" | "FAIL"
    details: str


class QualityMetrics(BaseModel):
    resolution: MetricAssessment
    sharpness: MetricAssessment
    brightness: MetricAssessment
    contrast: MetricAssessment
    visibility: MetricAssessment


class QualityIssue(BaseModel):
    code: str
    message: str
    details: str
    recommendation: str
    severity: str = "WARNING"  # "CRITICAL" | "WARNING"


class QualityAssessment(BaseModel):
    overall_score: int
    quality_category: str  # "Excellent" | "Good" | "Fair" | "Poor"
    status: str            # "ACCEPTED" | "WARNING" | "REJECTED"
    metrics: QualityMetrics
    issues: List[QualityIssue] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class ProcessingEligibility(BaseModel):
    eligible: bool
    next_step: str  # "READY_FOR_IMAGE_PROCESSING" | "IMAGE_REUPLOAD_REQUIRED" | "MANUAL_REVIEW_RECOMMENDED"


class ImageAnalysisResponse(BaseModel):
    success: bool
    image_id: str
    analysis: Optional[ImageAnalysisData] = None
    quality_assessment: QualityAssessment
    processing_eligibility: ProcessingEligibility
