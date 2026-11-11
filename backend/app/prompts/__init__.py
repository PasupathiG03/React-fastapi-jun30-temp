"""
Prompts Module for BigBasket Gemini Vision AI Architecture.
Exposes System Prompts, Rules, Output Schemas, and User Prompt Builders.
"""

from app.prompts.system_prompt import SYSTEM_PROMPT, SUBREGION_SYSTEM_PROMPT
from app.prompts.rules import CATEGORY_RULES, IMAGE_ROLE_RULES, PACKAGING_SUBREGION_RULES
from app.prompts.output_schema import (
    GEMINI_CLASSIFICATION_SCHEMA,
    PACKAGING_SUBREGIONS_SCHEMA,
    MRP_EXPIRY_STAMPS_SCHEMA,
    EXAMPLE_OUTPUT,
    EXAMPLE_SUBREGIONS_OUTPUT,
)
from app.prompts.classification import build_gemini_classification_prompt
from app.prompts.sub_regions import build_gemini_subregions_prompt
from app.prompts.mrp_expiry import MRP_EXPIRY_SYSTEM_PROMPT, build_gemini_mrp_expiry_prompt

__all__ = [
    "SYSTEM_PROMPT",
    "SUBREGION_SYSTEM_PROMPT",
    "MRP_EXPIRY_SYSTEM_PROMPT",
    "CATEGORY_RULES",
    "IMAGE_ROLE_RULES",
    "PACKAGING_SUBREGION_RULES",
    "GEMINI_CLASSIFICATION_SCHEMA",
    "PACKAGING_SUBREGIONS_SCHEMA",
    "MRP_EXPIRY_STAMPS_SCHEMA",
    "EXAMPLE_OUTPUT",
    "EXAMPLE_SUBREGIONS_OUTPUT",
    "build_gemini_classification_prompt",
    "build_gemini_subregions_prompt",
    "build_gemini_mrp_expiry_prompt",
]

