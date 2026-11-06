import csv
import io
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import openpyxl


class ManifestParser:
    """Parses Excel/CSV manifests, detects column mappings, and validates BBID image records."""

    BBID_PATTERNS = [r"bbid", r"product[\s_-]*id", r"sku", r"item[\s_-]*code", r"^id$"]
    FILENAME_PATTERNS = [r"file[\s_-]*name", r"image[\s_-]*name", r"^image$", r"^file$", r"photo"]
    CATEGORY_PATTERNS = [r"image[\s_-]*type", r"^type$", r"category", r"classification", r"tag"]
    SEQUENCE_PATTERNS = [r"seq", r"sequence", r"^order$", r"^index$", r"position"]

    @classmethod
    def detect_column(cls, headers: List[str], patterns: List[str]) -> Optional[str]:
        for h in headers:
            clean_h = str(h).strip().lower()
            for pat in patterns:
                if re.search(pat, clean_h):
                    return h
        return None

    @classmethod
    def read_manifest(cls, file_content: bytes, filename: str) -> Tuple[List[str], List[Dict[str, Any]]]:
        headers: List[str] = []
        rows: List[Dict[str, Any]] = []

        if filename.lower().endswith((".xlsx", ".xlsm", ".xltx", ".xltm")):
            wb = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
            sheet = wb.active
            for idx, row in enumerate(sheet.iter_rows(values_only=True)):
                if not row or all(v is None for v in row):
                    continue
                if not headers:
                    headers = [str(cell).strip() if cell is not None else f"col_{i}" for i, cell in enumerate(row)]
                else:
                    row_dict = {headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))}
                    rows.append(row_dict)
        elif filename.lower().endswith(".csv"):
            text = file_content.decode("utf-8-sig", errors="replace")
            reader = csv.reader(io.StringIO(text))
            for row in reader:
                if not row or all(not v.strip() for v in row):
                    continue
                if not headers:
                    headers = [str(c).strip() for c in row]
                else:
                    row_dict = {headers[i]: (row[i].strip() if i < len(row) else None) for i in range(len(headers))}
                    rows.append(row_dict)
        else:
            raise ValueError(f"Unsupported manifest file extension: {filename}")

        return headers, rows

    @classmethod
    def get_preview(cls, file_content: bytes, filename: str) -> Dict[str, Any]:
        headers, rows = cls.read_manifest(file_content, filename)
        suggested = {
            "bbid": cls.detect_column(headers, cls.BBID_PATTERNS) or (headers[0] if headers else ""),
            "filename": cls.detect_column(headers, cls.FILENAME_PATTERNS) or (headers[1] if len(headers) > 1 else ""),
            "category": cls.detect_column(headers, cls.CATEGORY_PATTERNS) or "",
            "sequence": cls.detect_column(headers, cls.SEQUENCE_PATTERNS) or "",
        }
        return {
            "filename": filename,
            "total_rows": len(rows),
            "columns": headers,
            "sample_rows": rows[:10],
            "suggested_mapping": suggested,
        }

    @classmethod
    def parse_records(
        cls,
        file_content: bytes,
        filename: str,
        column_map: Dict[str, str],
    ) -> List[Dict[str, Any]]:
        headers, rows = cls.read_manifest(file_content, filename)

        bbid_col = column_map.get("bbid") or cls.detect_column(headers, cls.BBID_PATTERNS)
        file_col = column_map.get("filename") or cls.detect_column(headers, cls.FILENAME_PATTERNS)
        cat_col = column_map.get("category")
        seq_col = column_map.get("sequence")

        if not bbid_col or not file_col:
            raise ValueError("BBID column and Filename column must be mapped.")

        records = []
        for idx, r in enumerate(rows, start=1):
            raw_bbid = r.get(bbid_col)
            raw_file = r.get(file_col)
            if not raw_bbid or not raw_file:
                continue

            bbid = str(raw_bbid).strip()
            # If BBID has .0 from Excel numeric formatting
            if bbid.endswith(".0"):
                bbid = bbid[:-2]

            image_name = str(raw_file).strip()
            category = str(r.get(cat_col, "unknown")).strip().lower() if cat_col else "unknown"
            
            raw_seq = r.get(seq_col)
            seq = int(raw_seq) if raw_seq and str(raw_seq).isdigit() else idx
            product_category = str(r.get("Category") or r.get("category") or r.get("Product Category") or "general").strip().lower()

            records.append({
                "bbid": bbid,
                "original_filename": image_name,
                "image_type": category,
                "category": product_category,
                "sequence_order": seq,
            })

        return records

    @classmethod
    def generate_template(cls) -> bytes:
        """Generates an official BigBasket Product Manifest Excel (.xlsx) template with sample rows and guidelines."""
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Product Manifest"

        # Headers
        headers = [
            "BBID",
            "File Name",
            "Image Type",
            "Sequence Order",
            "Product Title",
            "Category",
            "Notes",
        ]
        ws.append(headers)

        # Sample rows
        sample_rows = [
            [
                "40022475",
                "Front Image.jpg",
                "FOP",
                1,
                "Mee Mee Mild Laundry Detergent 1.2L",
                "Baby Care",
                "Front of pack (FOP) - standard 180px padding",
            ],
            [
                "40022475",
                "Back Image.jpg",
                "BOP",
                2,
                "Mee Mee Mild Laundry Detergent 1.2L",
                "Baby Care",
                "Back of pack (BOP) - ingredients & instructions",
            ],
            [
                "1219025",
                "1219025-1.png",
                "FOP",
                1,
                "Fresho Organic Apple Royal Gala 500g",
                "Fruits & Veg",
                "Transparent background pack shot",
            ],
            [
                "20004725",
                "20004725 (1).png",
                "Nutritional",
                3,
                "Epigamia Greek Yogurt Natural 100g",
                "Dairy",
                "Edge-to-edge 0px padding full bleed",
            ],
        ]
        for row in sample_rows:
            ws.append(row)

        # Styling
        header_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        thin_border = Border(
            left=Side(style="thin", color="CBD5E1"),
            right=Side(style="thin", color="CBD5E1"),
            top=Side(style="thin", color="CBD5E1"),
            bottom=Side(style="thin", color="CBD5E1"),
        )

        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border

        for row in ws.iter_rows(min_row=2, max_row=len(sample_rows) + 1):
            for cell in row:
                cell.font = Font(name="Calibri", size=11)
                cell.border = thin_border
                if cell.column in (1, 3, 4):
                    cell.alignment = Alignment(horizontal="center")

        # Auto-adjust column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

        # Sheet 2: Guidelines
        ws_guide = wb.create_sheet(title="Specifications & Guidelines")
        guidelines = [
            ["Image Studio - Catalog Requirements"],
            [""],
            ["Field", "Required", "Description", "Permitted Values / Examples"],
            ["Product ID / SKU", "YES", "Unique Product / SKU Identifier", "e.g. 40022475, 1219025"],
            ["File Name", "YES", "Exact filename matching the uploaded image in ZIP or Drive", "e.g. Front Image.jpg, 1219025-1.png"],
            ["Image Type", "RECOMMENDED", "Image classification determines auto-framing", "FOP, BOP, Nutritional, Lifestyle, Infographic"],
            ["Sequence Order", "OPTIONAL", "Display sequence on catalog (1 = Hero / Main)", "1, 2, 3, 4, ..."],
            ["Product Title", "OPTIONAL", "Descriptive item name for reference & QA audit", "e.g. Mee Mee Mild Laundry Detergent"],
            ["Category", "OPTIONAL", "Product category / department", "e.g. Grocery, Baby Care, Dairy"],
            [""],
            ["Canvas Specifications (SRS Standards):"],
            ["• Canvas Resolution: 2000 × 2000 pixels (1:1 square)."],
            ["• DPI Header: Minimum 150 DPI."],
            ["• FOP / BOP: 180px top & bottom padding, 100px left & right padding within 1820 × 1640 bounding box."],
            ["• Background: Clean transparent PNG (RGBA) for product packs."],
            ["• Nutritional / Lifestyle: Full canvas bleed (0px edge-to-edge padding)."],
        ]
        for r in guidelines:
            ws_guide.append(r)

        ws_guide["A1"].font = Font(name="Calibri", size=14, bold=True, color="0284C7")
        for cell in ws_guide[3]:
            cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="0369A1", end_color="0369A1", fill_type="solid")

        ws_guide.column_dimensions["A"].width = 24
        ws_guide.column_dimensions["B"].width = 16
        ws_guide.column_dimensions["C"].width = 60
        ws_guide.column_dimensions["D"].width = 45

        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

