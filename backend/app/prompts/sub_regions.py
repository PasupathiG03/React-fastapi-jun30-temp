"""
Prompt Builder for BigBasket Packaging Sub-Region Detection & Localization Requests.
"""

from typing import Optional


def build_gemini_subregions_prompt(
    bbid: str = "",
    filename: str = "",
    category: str = "FOOD",
    additional_context: Optional[str] = None,
) -> str:
    """
    Constructs a clean, dynamic contextual user message sent to the Gemini Vision model.
    All system instructions and sub-region decomposition rules are maintained in
    SUBREGION_SYSTEM_PROMPT and PACKAGING_SUBREGIONS_SCHEMA.
    """
    lines = [
        "Analyze this packaging image and decompose it into its constituent statutory and informational sub-regions adhering strictly to the system rules and output schema.",
    ]

    if bbid:
        lines.append(f"- SKU / BBID identifier: '{bbid}'")
    if category:
        lines.append(f"- Product Category: '{category}'")
    if filename:
        lines.append(f"- Original filename cue: '{filename}'")
    if additional_context:
        lines.append(f"- Additional catalog context: '{additional_context}'")

    lines.append(
        "Detect all visible sub-regions, determine their normalized bounding boxes [ymin, xmin, ymax, xmax], "
        "and return valid JSON conforming to the schema."
    )

    return "\n".join(lines)

    return "\n".join(lines)

