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
    Constructs the contextual user message sent to the Gemini Vision model
    for packaging sub-region decomposition and 2D coordinate extraction.
    """
    lines = [
        "Analyze this packaging image and locate all statutory and informational sub-regions with 100% boundary precision.",
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
        "For each sub-region present on the package, extract its exact normalized 2D bounding box "
        "[ymin, xmin, ymax, xmax] scaled strictly from 0 to 1000.\n"
        "Target sub-regions:\n"
        "1. 'ingredient': Ingredients and allergen declaration block.\n"
        "2. 'nutritional': Complete Nutritional facts table (headers, rows, RDA).\n"
        "3. 'manufactured_by': Marketed By, Manufactured By, Packer addresses and customer care.\n"
        "4. 'fssai': Complete FSSAI logo emblem AND 14-digit license number.\n"
        "5. 'barcode': 1D linear zebra barcode stripes (EAN-13, UPC, Code 128) or 2D matrix. "
        "MANDATORY DIRECTIVE: If any barcode is visible anywhere on the packaging, you MUST identify it as 'barcode', "
        "set 'is_standalone_crop: true', and tightly frame its full vertical bars, human-readable numbers beneath, and quiet margins.\n"
        "6. 'directions': Preparation / cooking / usage instructions.\n"
        "7. 'caution': Safety warnings and cautionary notices.\n"
        "8. 'storage': Storage condition guidelines.\n\n"
        "Zero Clipping Rule: Ensure bounding boxes include character ascenders/descenders, punctuation, "
        "and enclosing table borders. Exclude neighboring unrelated sections.\n"
        "Dynamic Standalone Crop Qualification:\n"
        "- Set 'is_standalone_crop: true' and assign a natural sequential 'catalog_sequence' (starting from 1) "
        "in logical catalog order for whatever specification crops are present on the packaging "
        "(ingredients, nutritional panel, manufacturer details, statutory licenses, barcode).\n"
        "- Set 'is_standalone_crop: false' and 'catalog_sequence: null' for general narrative pack copy "
        "(directions, caution, storage).\n"
        "Respond in validated JSON conforming to the requested schema."
    )

    return "\n".join(lines)

