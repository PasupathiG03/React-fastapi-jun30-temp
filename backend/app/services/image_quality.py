import logging
from typing import List, Optional
from app.core.image_quality_config import quality_settings
from app.schemas.image_analysis import (
    ImageAnalysisData,
    MetricAssessment,
    ProcessingEligibility,
    QualityAssessment,
    QualityIssue,
    QualityMetrics,
)

logger = logging.getLogger(__name__)


def assess_image_quality(
    analysis: ImageAnalysisData,
    min_width: Optional[int] = None,
    min_height: Optional[int] = None,
) -> QualityAssessment:
    """
    Step 3: Image Quality Assessment.
    Evaluates:
    - Resolution (25 pts): verifies width >= min_width and height >= min_height (default >= 1500px).
    - Sharpness (30 pts)
    - Brightness (15 pts)
    - Contrast (15 pts)
    - Visibility & Usability (15 pts)
    Total: 100 pts.
    """
    issues: List[QualityIssue] = []
    recommendations: List[str] = []

    width = analysis.width
    height = analysis.height
    chars = analysis.characteristics

    # -------------------------------------------------------------------------
    # A. Resolution Assessment (Max 25 pts)
    # Default: 1080x1440 px or dynamic user-specified dimensions
    # -------------------------------------------------------------------------
    req_w = min_width if (min_width and min_width > 0) else quality_settings.resolution.default_min_width
    req_h = min_height if (min_height and min_height > 0) else quality_settings.resolution.default_min_height

    w_ratio = width / float(req_w)
    h_ratio = height / float(req_h)
    min_ratio = min(w_ratio, h_ratio)

    if width >= req_w and height >= req_h:
        res_score = quality_settings.weights.resolution
        res_status = "PASS"
        res_details = f"Resolution is sufficient ({width}×{height}px >= {req_w}×{req_h}px)."
    elif min_ratio >= quality_settings.resolution.warning_ratio:  # e.g. >= 85%
        res_score = round(quality_settings.weights.resolution * min_ratio, 1)
        res_status = "WARNING"
        res_details = (
            f"Resolution is slightly below target ({width}×{height}px vs {req_w}×{req_h}px). "
            f"Shortfall: {max(0, req_w - width)}w, {max(0, req_h - height)}h."
        )
        issues.append(
            QualityIssue(
                code="RESOLUTION_BORDERLINE",
                message="Image resolution is slightly below requested dimensions.",
                details=f"Detected: {width} × {height} pixels. Required: ≥ {req_w} × {req_h} pixels.",
                recommendation=f"Upload an image with width ≥ {req_w}px and height ≥ {req_h}px for optimal clarity.",
                severity="WARNING",
            )
        )
    else:
        res_score = round(quality_settings.weights.resolution * max(0.0, min_ratio * 0.5), 1)
        res_status = "FAIL"
        res_details = (
            f"Image resolution is too low ({width}×{height}px). "
            f"Required: ≥ {req_w}×{req_h}px."
        )
        issues.append(
            QualityIssue(
                code="LOW_RESOLUTION",
                message="Image resolution is too low.",
                details=f"Detected dimensions: {width} × {height} pixels. Required: ≥ {req_w} × {req_h} pixels.",
                recommendation=f"Upload a higher-resolution image with at least {req_w} × {req_h} pixels.",
                severity="CRITICAL",
            )
        )

    # -------------------------------------------------------------------------
    # B. Sharpness Assessment (Max 30 pts)
    # Method: OpenCV Laplacian variance
    # -------------------------------------------------------------------------
    lap_var = chars.sharpness_laplacian_var if chars else 0.0
    sharp_min = quality_settings.sharpness.sharp_min          # 100.0
    blur_min = quality_settings.sharpness.slight_blur_min     # 50.0

    if lap_var >= sharp_min:
        sharp_score = quality_settings.weights.sharpness
        sharp_status = "PASS"
        sharp_details = f"Image is sufficiently sharp (Laplacian variance: {lap_var:.1f})."
    elif lap_var >= blur_min:
        # Slightly blurry
        frac = (lap_var - blur_min) / (sharp_min - blur_min)
        sharp_score = round(15.0 + (15.0 * frac), 1)
        sharp_status = "WARNING"
        sharp_details = f"Image is slightly blurry or soft (Laplacian variance: {lap_var:.1f})."
        issues.append(
            QualityIssue(
                code="SLIGHT_BLUR",
                message="The image is slightly blurry.",
                details=f"Sharpness variance {lap_var:.1f} is between {blur_min} and {sharp_min}.",
                recommendation="Upload a sharper photograph with focused product edges.",
                severity="WARNING",
            )
        )
    else:
        # Very blurry - critical failure
        sharp_score = round(max(0.0, 10.0 * (lap_var / blur_min)), 1)
        sharp_status = "FAIL"
        sharp_details = f"Image is severely blurry (Laplacian variance: {lap_var:.1f} < {blur_min})."
        issues.append(
            QualityIssue(
                code="IMAGE_BLUR",
                message="The image is severely blurry.",
                details=f"Sharpness variance {lap_var:.1f} is below the critical threshold ({blur_min}).",
                recommendation="Upload a clearer photograph without camera shake or motion blur.",
                severity="CRITICAL",
            )
        )

    # -------------------------------------------------------------------------
    # C. Brightness Assessment (Max 15 pts)
    # Average intensity on [0, 255]
    # -------------------------------------------------------------------------
    b_mean = chars.brightness_mean if chars else 128.0
    b_min = quality_settings.brightness.acceptable_min  # 80.0
    b_max = quality_settings.brightness.acceptable_max  # 200.0
    dark_crit = quality_settings.brightness.too_dark_critical      # 45.0
    bright_crit = quality_settings.brightness.too_bright_critical  # 230.0

    if b_min <= b_mean <= b_max and not (chars and (chars.is_extremely_dark or chars.is_overexposed)):
        bright_score = quality_settings.weights.brightness
        bright_status = "PASS"
        bright_details = f"Brightness is within the acceptable range (mean: {b_mean:.1f})."
    elif dark_crit <= b_mean < b_min:
        bright_score = round(7.0 + 8.0 * ((b_mean - dark_crit) / (b_min - dark_crit)), 1)
        bright_status = "WARNING"
        bright_details = f"Image is moderately dark/underexposed (mean: {b_mean:.1f})."
        issues.append(
            QualityIssue(
                code="UNDEREXPOSED_IMAGE",
                message="Image is darker than recommended.",
                details=f"Average luminance is {b_mean:.1f} (acceptable: {b_min}–{b_max}).",
                recommendation="Increase studio lighting or exposure to illuminate packaging details.",
                severity="WARNING",
            )
        )
    elif b_max < b_mean <= bright_crit:
        bright_score = round(7.0 + 8.0 * ((bright_crit - b_mean) / (bright_crit - b_max)), 1)
        bright_status = "WARNING"
        bright_details = f"Image is moderately bright/overexposed (mean: {b_mean:.1f})."
        issues.append(
            QualityIssue(
                code="OVEREXPOSED_IMAGE",
                message="Image is brighter than recommended.",
                details=f"Average luminance is {b_mean:.1f} (acceptable: {b_min}–{b_max}).",
                recommendation="Reduce harsh direct lighting or glare to prevent washed out highlights.",
                severity="WARNING",
            )
        )
    elif b_mean < dark_crit or (chars and chars.is_extremely_dark):
        bright_score = round(max(0.0, 5.0 * (b_mean / dark_crit)), 1)
        bright_status = "FAIL"
        bright_details = f"Image is extremely dark (mean luminance: {b_mean:.1f})."
        issues.append(
            QualityIssue(
                code="EXTREMELY_DARK",
                message="The image is extremely dark.",
                details=f"Average luminance {b_mean:.1f} is severely below minimum threshold ({dark_crit}).",
                recommendation="Improve lighting conditions and re-take the product photograph.",
                severity="CRITICAL",
            )
        )
    else:
        # b_mean > bright_crit or overexposed
        bright_score = round(max(0.0, 5.0 * ((255.0 - b_mean) / (255.0 - bright_crit))), 1)
        bright_status = "FAIL"
        bright_details = f"Image is severely overexposed with clipped highlights (mean: {b_mean:.1f})."
        issues.append(
            QualityIssue(
                code="EXTREMELY_OVEREXPOSED",
                message="The image is severely overexposed.",
                details=f"Average luminance {b_mean:.1f} is severely above maximum threshold ({bright_crit}).",
                recommendation="Lower exposure or use diffused light to prevent blowing out product text.",
                severity="CRITICAL",
            )
        )

    # -------------------------------------------------------------------------
    # D. Contrast Assessment (Max 15 pts)
    # Standard deviation of luminance
    # -------------------------------------------------------------------------
    contrast_val = chars.contrast_std if chars else 50.0
    c_ok = quality_settings.contrast.acceptable_min       # 40.0
    c_warn = quality_settings.contrast.low_contrast_warning # 25.0

    if contrast_val >= c_ok:
        contrast_score = quality_settings.weights.contrast
        contrast_status = "PASS"
        contrast_details = f"Image has sufficient contrast (std dev: {contrast_val:.1f})."
    elif contrast_val >= c_warn:
        contrast_score = round(7.0 + 8.0 * ((contrast_val - c_warn) / (c_ok - c_warn)), 1)
        contrast_status = "WARNING"
        contrast_details = f"Image has low contrast between foreground and surroundings (std dev: {contrast_val:.1f})."
        issues.append(
            QualityIssue(
                code="LOW_CONTRAST",
                message="Low contrast detected.",
                details=f"Contrast standard deviation is {contrast_val:.1f} (acceptable: ≥ {c_ok}).",
                recommendation="Ensure sufficient contrast between the product and background.",
                severity="WARNING",
            )
        )
    else:
        contrast_score = round(max(0.0, 5.0 * (contrast_val / c_warn)), 1)
        contrast_status = "FAIL"
        contrast_details = f"Image has severely flat/low contrast (std dev: {contrast_val:.1f} < {c_warn})."
        issues.append(
            QualityIssue(
                code="SEVERELY_LOW_CONTRAST",
                message="Severely low contrast.",
                details=f"Contrast standard deviation is {contrast_val:.1f}, below critical threshold ({c_warn}).",
                recommendation="Re-shoot with balanced lighting to make product boundaries distinct.",
                severity="CRITICAL",
            )
        )

    # -------------------------------------------------------------------------
    # E. Product Visibility & Usability Assessment (Max 15 pts)
    # Noise, obstruction, and usable foreground
    # -------------------------------------------------------------------------
    noise = chars.noise_level if chars else 5.0
    pos = analysis.product_position

    vis_score = quality_settings.weights.visibility
    vis_status = "PASS"
    vis_details_list = []

    if noise > quality_settings.noise.moderate_noise_max:  # > 25.0
        vis_score -= 8.0
        vis_status = "FAIL"
        issues.append(
            QualityIssue(
                code="HIGH_IMAGE_NOISE",
                message="Image contains excessive digital noise / grain.",
                details=f"Estimated noise level is {noise:.1f} (acceptable: ≤ {quality_settings.noise.low_noise_max}).",
                recommendation="Lower camera ISO and increase ambient lighting to reduce digital grain.",
                severity="WARNING",
            )
        )
        vis_details_list.append("high noise detected")
    elif noise > quality_settings.noise.low_noise_max:  # 12.0 - 25.0
        vis_score -= 4.0
        if vis_status != "FAIL":
            vis_status = "WARNING"
        issues.append(
            QualityIssue(
                code="MODERATE_IMAGE_NOISE",
                message="Image contains moderate digital noise.",
                details=f"Estimated noise level is {noise:.1f}.",
                recommendation="Improve lighting to minimize sensor noise.",
                severity="WARNING",
            )
        )
        vis_details_list.append("moderate noise")

    if pos and pos.has_large_empty_regions:
        vis_score -= 3.0
        if vis_status == "PASS":
            vis_status = "WARNING"
        issues.append(
            QualityIssue(
                code="LARGE_EMPTY_REGIONS",
                message="Product occupies only a small portion of the frame.",
                details=f"Estimated empty region ratio: {round(pos.empty_region_ratio * 100, 1)}%.",
                recommendation="Frame the product closer to maximize catalog detail.",
                severity="WARNING",
            )
        )
        vis_details_list.append("large empty background area")

    if not pos or not pos.potential_foreground_detected:
        vis_score -= 3.0
        if vis_status == "PASS":
            vis_status = "WARNING"
        vis_details_list.append("uncertain foreground separation")

    vis_score = max(0.0, round(vis_score, 1))
    if not vis_details_list:
        vis_details = "Image appears visually clear and suitable for further inspection."
    else:
        vis_details = f"Visual usability flagged: {', '.join(vis_details_list)}."

    # -------------------------------------------------------------------------
    # F. Overall Quality Score (0–100) & Acceptance Decision
    # -------------------------------------------------------------------------
    raw_total = res_score + sharp_score + bright_score + contrast_score + vis_score
    overall_score = int(round(max(0.0, min(100.0, raw_total))))

    if overall_score >= quality_settings.categories.excellent_min:  # 85
        category = "Excellent"
    elif overall_score >= quality_settings.categories.good_min:     # 70
        category = "Good"
    elif overall_score >= quality_settings.categories.fair_min:     # 50
        category = "Fair"
    else:
        category = "Poor"

    # Check for critical failures (MANDATORY REJECTION)
    has_critical_failure = any(iss.severity == "CRITICAL" for iss in issues)

    if has_critical_failure or overall_score < quality_settings.categories.fair_min:
        final_status = "REJECTED"
        eligible = False
        next_step = "IMAGE_REUPLOAD_REQUIRED"
    elif any(iss.severity == "WARNING" for iss in issues) or overall_score < quality_settings.categories.good_min:
        final_status = "WARNING"
        eligible = True
        next_step = "READY_FOR_IMAGE_PROCESSING" if overall_score >= quality_settings.categories.good_min else "MANUAL_REVIEW_RECOMMENDED"
    else:
        final_status = "ACCEPTED"
        eligible = True
        next_step = "READY_FOR_IMAGE_PROCESSING"

    # Collect unique recommendations
    for iss in issues:
        if iss.recommendation and iss.recommendation not in recommendations:
            recommendations.append(iss.recommendation)

    metrics = QualityMetrics(
        resolution=MetricAssessment(
            score=res_score,
            max_score=quality_settings.weights.resolution,
            status=res_status,
            details=res_details,
        ),
        sharpness=MetricAssessment(
            score=sharp_score,
            max_score=quality_settings.weights.sharpness,
            status=sharp_status,
            details=sharp_details,
        ),
        brightness=MetricAssessment(
            score=bright_score,
            max_score=quality_settings.weights.brightness,
            status=bright_status,
            details=bright_details,
        ),
        contrast=MetricAssessment(
            score=contrast_score,
            max_score=quality_settings.weights.contrast,
            status=contrast_status,
            details=contrast_details,
        ),
        visibility=MetricAssessment(
            score=vis_score,
            max_score=quality_settings.weights.visibility,
            status=vis_status,
            details=vis_details,
        ),
    )

    return QualityAssessment(
        overall_score=overall_score,
        quality_category=category,
        status=final_status,
        metrics=metrics,
        issues=issues,
        recommendations=recommendations,
    )

