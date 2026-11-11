"""
Prompt Builder for BigBasket Dynamic MRP, Expiry Date & Batch Code Stamp Localization.
Adheres strictly to BigBasket SRS Section 5: MRP and Expiry Information Removal.
Uses 100% dynamic semantic packaging analysis for global packaging (any country, currency, or language).

The rules below are deliberately generic (how variable print differs from permanent artwork),
never tied to a specific product, brand, layout, language, or currency.
"""

from typing import Optional


MRP_EXPIRY_SYSTEM_PROMPT = """You are an expert multimodal computer vision and FMCG retail packaging graphics analyst.
Your objective is to locate every VARIABLE packaging marking - retail price, unit price, expiry/best-before date, manufacturing/packing date, and batch/lot code - on packaging from any country, with tight, pixel-accurate bounding boxes.
A marking is variable when its value changes between production runs or price revisions. Permanent artwork that is identical on every unit of the product is never a target, even when it mentions price, dates, or batches.
You must return only valid JSON conforming strictly to the provided output schema."""


def build_gemini_mrp_expiry_prompt(
    bbid: str = "",
    filename: str = "",
    category: str = "FOOD",
    additional_context: Optional[str] = None,
) -> str:
    """
    Constructs the contextual user message sent to the Gemini Vision model
    to detect and locate MRP and expiration date markings on packaging.
    Operates 100% dynamically across global packaging from any country.
    """
    lines = [
        "Analyze this retail packaging image and locate every variable price, date, and batch marking "
        "that must be removed from catalog images per BigBasket SRS Section 5.",
    ]

    if category:
        lines.append(f"Product category: {category}")
    if filename:
        lines.append(f"Image context: {filename}")
    if additional_context:
        lines.append(f"Additional context: {additional_context}")

    lines.append(
        "\nSTEP 1 - SCAN METHODICALLY (do not stop early):\n"
        "- Sweep the whole image region by region: every panel, label, table, colored strip or box, margin, "
        "seam, crimp/seal edge, cap, shoulder and base.\n"
        "- Read text in every orientation (horizontal, vertical, rotated, upside-down, curved).\n"
        "- Pay special attention to small, isolated text; to anything printed beside machine-readable codes; "
        "and to the reserved print zone where a manufacturer stamps run data (often a blank or contrasting "
        "area, or a block of field labels such as price / batch / date headers).\n"
        "- Report EVERY separate occurrence; a package can carry the same field more than once.\n\n"

        "STEP 2 - DECIDE: VARIABLE (target) vs PERMANENT (never a target):\n"
        "Variable markings typically show one or more of these signs:\n"
        "- A value that would differ between batches or price revisions (a price amount, a calendar date, a run code).\n"
        "- Applied by a separate print process: inkjet / dot-matrix / laser / embossed / stamped characters, "
        "a font, weight, color or alignment that differs from the surrounding artwork, or text that sits "
        "slightly off-grid relative to the designed layout.\n"
        "- Placed in a reserved print zone or directly next to a field label that names it.\n"
        "- A short alphanumeric string printed beside a 2D / Data Matrix / QR code: these codes are normally "
        "printed per production run, so the human-readable string next to them is a run/batch code.\n"
        "FIELD HEADERS ARE TARGETS: a short label or stacked list of labels that names a price, unit price, batch, "
        "manufacturing or expiry field (with a value next to it OR an empty slot left for stamping) exists only "
        "to carry variable data - return each label line, together with its value when present.\n"
        "Permanent artwork - NEVER return these, even if they contain digits, dates or the words price/batch/date:\n"
        "- Running sentences inside paragraphs that only REFER to these fields (e.g. saying the batch number, "
        "dates or price are printed elsewhere on the pack), and shelf life expressed only as a duration from "
        "manufacture with no actual calendar date. These differ from field headers: they are part of body "
        "text, not a label with a value slot.\n"
        "- Barcode / GTIN digits printed under or beside a linear barcode.\n"
        "- Registration, license, certification, regulatory or standards numbers; article / item / SKU / "
        "model codes; recycling or material codes; phone numbers, postal codes, web or email addresses.\n"
        "- Net quantity (weight, volume, count), nutrition and ingredient values, usage directions, "
        "brand names, product names, claims, and manufacturer / marketer details.\n"
        "Set 'confidence' honestly for every returned item.\n\n"

        "STEP 3 - CATEGORIZE each variable marking by function (any language, script, currency or date notation):\n"
        "1. 'mrp': retail / maximum / consumer price, unit sale price (per weight, volume or unit), the currency "
        "symbol or code attached to it, and a tax-inclusion qualifier only when it is printed as part of that "
        "same price declaration. Include a price field label even if its value area is still blank.\n"
        "2. 'expiry_date': expiry, best-before, use-by or similar date, with its label.\n"
        "3. 'mfg_date': manufacturing, packing or production date, with its label.\n"
        "4. 'batch_code': batch / lot / control number with its label, OR an unlabeled run code - a short "
        "alphanumeric string printed by the variable print process, typically beside a 2D / QR / Data Matrix "
        "code or in the reserved print zone. Do not confuse it with barcode/GTIN digits or permanent codes.\n\n"

        "STEP 4 - BOX PRECISELY:\n"
        "- Return normalized boxes [ymin, xmin, ymax, xmax] on a 0-1000 scale, relative to the full image.\n"
        "- Box tightly around the characters of that one marking, with only a hairline margin. The box MUST "
        "fully contain the first and last character, including leading/trailing currency symbols, units, "
        "separators and punctuation - never cut a glyph in half.\n"
        "- Use one box per marking. When separate fields sit on separate lines, return separate boxes; when "
        "a label and its value form one line, return a single box for both.\n"
        "- NEVER include any part of a machine-readable code (linear barcode, QR code, Data Matrix, other 2D "
        "codes) - even when it encodes batch data. End the box at the gap between the code and the text.\n"
        "- NEVER extend a box over neighbouring permanent text or graphics; if a variable marking shares a "
        "container with permanent content (e.g. net quantity in the same strip), box only the variable part.\n"
        "- 'text_content' must be the exact characters inside the box.\n\n"

        "If the image has no variable markings (e.g. a clean front-of-pack hero shot, or only permanent "
        "references to these fields), set 'has_removable_stamps' to false and return an empty 'stamps' array.\n"
        "Respond in validated JSON conforming to the requested schema."
    )

    return "\n".join(lines)
