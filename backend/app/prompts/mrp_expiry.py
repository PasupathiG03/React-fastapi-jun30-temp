"""
Prompt Builder for BigBasket Dynamic MRP, Expiry Date & Batch Code Stamp Localization.
Adheres strictly to BigBasket SRS Section 5: MRP and Expiry Information Removal.
Uses 100% dynamic semantic packaging analysis for global packaging (any country, currency, or language).

The rules below are deliberately generic (how variable print differs from permanent artwork),
never tied to a specific product, brand, layout, language, or currency.
"""

from typing import Optional


MRP_EXPIRY_SYSTEM_PROMPT = """You are an expert multimodal computer vision and FMCG retail packaging graphics analyst.
Your objective is to locate the VARIABLE VALUES printed on packaging - the price amount, unit price amount, expiry/best-before date, manufacturing/packing date, and batch/lot code - on packaging from any country, with tight, pixel-accurate bounding boxes around the VALUE ONLY.
A value is variable when it changes between production runs or price revisions. Permanent artwork that is identical on every unit of the product is never a target, and neither is the printed wording that names a field (its label) or qualifies it: every label and qualifier stays on the pack and must never be inside a box.
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
        "FIELD LABELS ARE NEVER TARGETS: any label, or stacked list of labels, that names a price, unit price, "
        "batch, manufacturing or expiry field - and any qualifier text printed with such a field - is permanent "
        "printing, in whatever language or script it is written. Return only the VALUE printed next to or under "
        "it. If a label has no value yet (an empty slot), return nothing for it.\n"
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
        "1. 'mrp': the retail / maximum / consumer price AMOUNT or unit sale price amount (per weight, volume or "
        "unit). A currency symbol or code belongs to the value only when it is attached to the amount itself as "
        "part of the same printed figure; a symbol or code that sits with the field label, and any qualifier "
        "text, are labels, not values.\n"
        "2. 'expiry_date': the expiry, best-before or use-by DATE only, without its label.\n"
        "3. 'mfg_date': the manufacturing, packing or production DATE only, without its label.\n"
        "4. 'batch_code': the batch / lot / control number only (without its label), OR an unlabeled run code - a short "
        "alphanumeric string printed by the variable print process, typically beside a 2D / QR / Data Matrix "
        "code or in the reserved print zone. Do not confuse it with barcode/GTIN digits or permanent codes.\n\n"

        "STEP 4 - BOX PRECISELY:\n"
        "- Return normalized boxes [ymin, xmin, ymax, xmax] on a 0-1000 scale, relative to the full image.\n"
        "- ROW ALIGNMENT: Each box [ymin, xmin, ymax, xmax] must tightly enclose the VISIBLY printed characters "
        "on their actual row. When values appear next to a stacked list of labels, each value box must align to "
        "the exact vertical row and baseline of that specific value. If an intermediate label is empty or has "
        "no value, NEVER shift lower rows into its place.\n"
        "- Box tightly around the characters of the VALUE only, with only a hairline margin. The box MUST fully "
        "contain the first and last character of the value, including any separators and punctuation inside "
        "it - never cut a glyph in half - and MUST NOT touch the label next to it.\n"
        "- Use one box per value. When a label and its value share a line, the box starts where the value "
        "starts, after the label and any separator that follows it. A value printed under its label gets a box "
        "around just that value line; never include the label line or any qualifier line.\n"
        "- Dedicated stamp zones: when values are printed inside a dedicated window, patch, sticker or stamp zone "
        "next to pre-printed field labels, box only the value strings, from their first glyph to their final "
        "digit or punctuation, leaving every pre-printed label outside the boxes.\n"
        "- NEVER include any part of a machine-readable code (linear barcode, QR code, Data Matrix, other 2D "
        "codes) - even when it encodes batch data. End the box at the gap between the code and the text.\n"
        "- NEVER extend a box over neighbouring permanent text or graphics (including labels); if a variable value shares a "
        "container with permanent content (e.g. net quantity in the same strip), box only the variable value.\n"
        "- 'text_content' must be the exact characters inside the box (the value only, never the label).\n\n"

        "If the image has no variable markings (e.g. a clean front-of-pack hero shot, or only permanent "
        "references to these fields), set 'has_removable_stamps' to false and return an empty 'stamps' array.\n"
        "Respond in validated JSON conforming to the requested schema."
    )

    return "\n".join(lines)
