export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function escapeCell(v: string | number | boolean | null | undefined): string {
  let s = v == null ? "" : String(v);
  // A cell starting with = + - @ (or a tab/CR) is run as a formula when the file is opened in Excel.
  // A leading apostrophe makes it plain text. Real numbers are left alone.
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download rows as a CSV file (UTF-8 with BOM so Excel opens it correctly). */
export function exportToCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(",")),
  ];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
