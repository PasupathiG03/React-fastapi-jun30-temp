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
Remove VALUES only: the printed field labels that name them (price, unit price, batch, mfg, expiry headers) are permanent artwork and must stay untouched.
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
        "VALUES ONLY, NEVER LABELS: a field label or stacked list of labels that names a price, unit price, batch, "
        "manufacturing or expiry field is printed artwork and must be kept. Return only the variable VALUE printed "
        "next to / after / below the label. If a label's value slot is empty (nothing stamped yet), there is "
        "nothing to remove for that field - do not return it.\n"
        "Permanent artwork - NEVER return these, even if they contain digits, dates or the words price/batch/date:\n"
        "- Running sentences inside paragraphs that only REFER to these fields (e.g. saying the batch number, "
        "dates or price are printed elsewhere on the pack), and shelf life expressed only as a duration from "
        "manufacture with no actual calendar date. Like field labels, these are permanent and stay.\n"
        "- Barcode / GTIN digits printed under or beside a linear barcode.\n"
        "- Registration, license, certification, regulatory or standards numbers; article / item / SKU / "
        "model codes; recycling or material codes; phone numbers, postal codes, web or email addresses.\n"
        "- Net quantity (weight, volume, count), nutrition and ingredient values, usage directions, "
        "brand names, product names, claims, and manufacturer / marketer details.\n"
        "Set 'confidence' honestly for every returned item.\n\n"

        "STEP 3 - CATEGORIZE each variable marking by function (any language, script, currency or date notation):\n"
        "1. 'mrp': the retail / maximum / consumer price amount and the unit sale price amount (per weight, volume "
        "or unit), including a currency symbol / code or unit printed together WITH the amount. Exclude the label "
        "words, any currency symbol or tax qualifier that belongs to the printed label, and label punctuation.\n"
        "2. 'expiry_date': the expiry, best-before, use-by or similar date value only.\n"
        "3. 'mfg_date': the manufacturing, packing or production date value only.\n"
        "4. 'batch_code': the batch / lot / control number value (not its label), OR an unlabeled run code - a short "
        "alphanumeric string printed by the variable print process, typically beside a 2D / QR / Data Matrix "
        "code or in the reserved print zone. Do not confuse it with barcode/GTIN digits or permanent codes.\n\n"

        "STEP 4 - BOX PRECISELY:\n"
        "- Return normalized boxes [ymin, xmin, ymax, xmax] on a 0-1000 scale, relative to the full image.\n"
        "- Box tightly around the characters of that one marking, with only a hairline margin. The box MUST "
        "fully contain the first and last character, including leading/trailing currency symbols, units, "
        "separators and punctuation - never cut a glyph in half.\n"
        "- Use one box per value; separate fields on separate lines get separate boxes.\n"
        "- When a label and its value share a line, start the box at the first character of the value and "
        "leave a visible gap to the label - never cover any part of the label text.\n"
        "- NEVER include any part of a machine-readable code (linear barcode, QR code, Data Matrix, other 2D "
        "codes) - even when it encodes batch data. End the box at the gap between the code and the text.\n"
        "- NEVER extend a box over neighbouring permanent text or graphics; if a variable marking shares a "
        "container with permanent content (e.g. net quantity in the same strip), box only the variable part.\n"
        "- 'text_content' must be the exact characters inside the box.\n\n"

        "If the image has no variable markings (e.g. a clean front-of-pack hero shot, only permanent "
        "references to these fields, or field labels whose value slots are empty), set 'has_removable_stamps' to false and return an empty 'stamps' array.\n"
        "Respond in validated JSON conforming to the requested schema."
    )

    return "\n".join(lines)
