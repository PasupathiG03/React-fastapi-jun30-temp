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
        "STRICT DYNAMIC VISUAL CLASSIFICATION DIRECTIVES:\n"
        "- 'FOP' (Front of Pack): The primary front, 3/4 hero view, or front packaging face of the standalone product. "
        "Even if photographed on a household surface (table, shelf, floor) or with un-clipped background, if the main subject "
        "is the front face of the product without active human interaction, it is 'FOP' (to allow automated AI background removal). "
        "NEVER classify as 'LIFESTYLE' unless human models are actively holding/demonstrating it.\n"
        "- 'BOP' (Back of Pack): The rear face, back panel, regulatory panel, or underside of the product showing "
        "directions, barcode, manufacturer details, or ingredients.\n"
        "- 'LIFESTYLE': ONLY when visible human models, people, or active demonstration scenes are present.\n"
        "- 'INFOGRAPHIC': Graphic marketing banners with multiple promotional text callouts, benefit icons, or multi-pack layouts.\n"
        "Respond in validated JSON format conforming to the requested schema."
    )

    return "\n".join(lines)

