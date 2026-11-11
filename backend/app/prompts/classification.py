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
        "- 'FOP' (Front of Pack): Primary product packshot showing the product, packaging, or complete multi-piece kit/set of items included for sale on a plain backdrop for background cutout.\n"
        "- 'BOP' (Back of Pack): Rear face, back panel, regulatory panel, or underside showing specifications, barcode, or ingredients.\n"
        "- 'LIFESTYLE': Action, in-use, or demonstration scenes showing the product interacting with food, beverages, liquid splashes, serving props, or real-world environments (preserve original background).\n"
        "- 'INFOGRAPHIC': Graphic banners containing promotional text callouts, dimension diagrams, specification charts, or feature bullet points.\n"
        "Respond in validated JSON format conforming to the requested schema."
    )

    return "\n".join(lines)

