/** Parses one CSV file's text into rows of cells (RFC4180-ish: quoted fields, "" as an escaped quote,
 * commas/newlines inside quotes, both CRLF and LF). The mirror of exportToCsv's own escaping rules. */
export function parseCsv(text: string): string[][] {
  // A leading UTF-8 BOM (exportToCsv writes one) would otherwise end up stuck to the first header cell.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c === "\r") {
      // paired \n (if any) is handled by the \n branch above; a lone \r still ends the row
      if (text[i + 1] !== "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Trailing blank lines (common at end of file) parse as a single empty cell -- drop them.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Header row -> column index, matched case/space-insensitively against each of a field's accepted names. */
export function mapCsvColumns(
  header: string[],
  fields: Record<string, string[]>
): Record<string, number> {
  const normalized = header.map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ""));
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(fields)) {
    const wanted = aliases.map((a) => a.toLowerCase().replace(/[\s_-]+/g, ""));
    const idx = normalized.findIndex((h) => wanted.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}
