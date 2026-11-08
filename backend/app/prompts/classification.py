"""
Prompt Builder for BigBasket Multimodal Product Classification Requests.
"""

from typing import Optional


def build_gemini_classification_prompt(filename: str = "", bbid: str = "", additional_context: Optional[str] = None) -> str:
    """
    Constructs the contextual user message sent to the Gemini Vision model
    along with the image bytes.
    """
    lines = [
        "Analyze and classify this BigBasket catalog product image with 100% precision.",
    ]

    if bbid:
        lines.append(f"- SKU / BBID identifier: '{bbid}'")
    if filename:
        lines.append(f"- Original filename cue: '{filename}'")
    if additional_context:
        lines.append(f"- Additional catalog context: '{additional_context}'")

    lines.append(
        "Determine primary_category (FOOD, NON_FOOD, or KITCHEN_ITEMS), subcategory, product_type, "
        "materials, structural components, visual properties, and catalog image_type.\n"
        "STRICT IMAGE TYPE DIRECTIVES:\n"
        "- If the image depicts an upright, front, top, or hero view of a standalone product without human models and without marketing text, classify as 'FOP'. NEVER 'LIFESTYLE'.\n"
        "- If the image depicts the rear face, back side, bottom base, or an inverted/upside-down view (e.g. stool upside down showing legs and underside ribs), classify as 'BOP'. NEVER 'FOP'.\n"
        "- Only classify as 'LIFESTYLE' if human models or people are actively interacting with the product or in a composite promotional scene.\n"
        "Respond in validated JSON format conforming to the requested schema."
    )

    return "\n".join(lines)

