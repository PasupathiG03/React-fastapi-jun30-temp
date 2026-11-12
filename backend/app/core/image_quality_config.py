from typing import Dict, List, Set
from pydantic import BaseModel, Field


class QualityWeights(BaseModel):
    """
    Weighted scoring system summing to 100 points.
    - Resolution: 25 points
    - Sharpness: 30 points
    - Brightness: 15 points
    - Contrast: 15 points
    - Visibility & Usability: 15 points
    """
    resolution: float = 25.0
    sharpness: float = 30.0
    brightness: float = 15.0
    contrast: float = 15.0
    visibility: float = 15.0


class ResolutionThresholds(BaseModel):
    default_min_width: int = 1500   # Default required width in px (>= 1500px)
    default_min_height: int = 1500  # Default required height in px (>= 1500px)
    min_dimension: int = 1500
    warning_ratio: float = 0.85
    critical_rejection_ratio: float = 0.60


class SharpnessThresholds(BaseModel):
    # OpenCV Laplacian variance thresholds
    sharp_min: float = 100.0        # >= 100: Sharp (PASS)
    slight_blur_min: float = 50.0   # 50 - 100: Slightly Blurry (WARNING)
    # < 50: Very Blurry (FAIL / REJECT)


class BrightnessThresholds(BaseModel):
    # Average pixel intensity on [0, 255]
    acceptable_min: float = 70.0
    acceptable_max: float = 215.0
    too_dark_critical: float = 40.0
    too_bright_critical: float = 245.0
    dark_pixel_ratio_critical: float = 0.55   # > 55% pixels near black
    bright_pixel_ratio_critical: float = 0.65 # > 65% pixels near pure white


class ContrastThresholds(BaseModel):
    # Standard deviation of luminance
    acceptable_min: float = 40.0
    low_contrast_warning: float = 25.0
    # < 25: Severely low contrast (FAIL / REJECT)


class NoiseThresholds(BaseModel):
    # Standard deviation of median/high-frequency difference
    low_noise_max: float = 12.0
    moderate_noise_max: float = 25.0
    # > 25: Excessively noisy


class ScoreCategories(BaseModel):
    excellent_min: float = 85.0
    good_min: float = 70.0
    fair_min: float = 50.0
    # 0 - 49: Poor


class ImageQualitySettings(BaseModel):
    """
    Central configurable settings for Product Image Analysis & Quality Assessment.
    All thresholds are configurable and can be calibrated against real catalog datasets.
    """
    supported_formats: Set[str] = {"JPEG", "JPG", "PNG", "WEBP", "TIFF", "BMP"}
    max_file_size_bytes: int = 50 * 1024 * 1024  # 50 MB
    max_image_pixels: int = 100_000_000         # 100 MP decompression bomb limit

    weights: QualityWeights = Field(default_factory=QualityWeights)
    resolution: ResolutionThresholds = Field(default_factory=ResolutionThresholds)
    sharpness: SharpnessThresholds = Field(default_factory=SharpnessThresholds)
    brightness: BrightnessThresholds = Field(default_factory=BrightnessThresholds)
    contrast: ContrastThresholds = Field(default_factory=ContrastThresholds)
    noise: NoiseThresholds = Field(default_factory=NoiseThresholds)
    categories: ScoreCategories = Field(default_factory=ScoreCategories)


# Singleton instance
quality_settings = ImageQualitySettings()
