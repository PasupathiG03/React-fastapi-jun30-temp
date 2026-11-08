"""
Prompts Module for BigBasket Gemini Vision AI Architecture.
Exposes System Prompts, Rules, Output Schemas, and User Prompt Builders.
"""

from app.prompts.system_prompt import SYSTEM_PROMPT
from app.prompts.rules import CATEGORY_RULES
from app.prompts.output_schema import GEMINI_CLASSIFICATION_SCHEMA, EXAMPLE_OUTPUT
from app.prompts.classification import build_gemini_classification_prompt

__all__ = [
    "SYSTEM_PROMPT",
    "CATEGORY_RULES",
    "GEMINI_CLASSIFICATION_SCHEMA",
    "EXAMPLE_OUTPUT",
    "build_gemini_classification_prompt",
]

