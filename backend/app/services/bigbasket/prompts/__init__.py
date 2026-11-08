"""
Re-export of central prompts for the BigBasket AI Service layer.
"""

from app.prompts import (
    SYSTEM_PROMPT,
    CATEGORY_RULES,
    GEMINI_CLASSIFICATION_SCHEMA,
    EXAMPLE_OUTPUT,
    build_gemini_classification_prompt,
)

__all__ = [
    "SYSTEM_PROMPT",
    "CATEGORY_RULES",
    "GEMINI_CLASSIFICATION_SCHEMA",
    "EXAMPLE_OUTPUT",
    "build_gemini_classification_prompt",
]

