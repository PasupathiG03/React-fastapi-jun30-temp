import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Search, X } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "@/hooks/useTableData";
import { CustomSelect } from "@/components/CustomSelect";

interface SearchInputProps {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
  className?: string;
}

/** The search box alone, reusable anywhere a table card header needs to lay it out on its own
 * (e.g. apart from the Export button -- see RoleManagement.tsx/UserManagement.tsx). */
export function TableSearchInput({ query, onQueryChange, placeholder = "Search...", className = "" }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 glass-field dark:bg-[#0e1a38] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
          title="Clear"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

interface ExportButtonProps {
  onExport: () => void;
  disabled?: boolean;
  className?: string;
}

/** The Export button alone -- see TableSearchInput above for why this is split out of TableToolbar. */
export function TableExportButton({ onExport, disabled, className = "" }: ExportButtonProps) {
  return (
    <button
      type="button"
      onClick={onExport}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 glass-btn border border-slate-200 dark:border-white/10 rounded-xl hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-40 transition-colors shadow-sm ${className}`}
      title="Export to CSV"
    >
      <Download className="w-3.5 h-3.5" />
      Export
    </button>
  );
}

interface ToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onExport?: () => void;
  exportDisabled?: boolean;
  placeholder?: string;
}

/** Search box + Export button, shown in a table card header. */
export function TableToolbar({ query, onQueryChange, onExport, exportDisabled, placeholder = "Search..." }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TableSearchInput query={query} onQueryChange={onQueryChange} placeholder={placeholder} className="w-full sm:w-52" />
      {onExport && <TableExportButton onExport={onExport} disabled={exportDisabled} />}
    </div>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}

function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/** Footer: rows-per-page (left), first/prev/pages/next/last (center), "Showing x–y of z" (right). */
export function TablePagination({ page, pageSize, totalPages, totalItems, onPageChange, onPageSizeChange }: PaginationProps) {
  if (totalItems === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const nav =
    "w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="px-4 sm:px-6 py-2 sm:py-3 border-t border-slate-100 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 items-center gap-1.5 sm:gap-3 bg-white/30 dark:bg-[#0c1427]/30 text-xs">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 sm:justify-self-start">
        <span>Per page:</span>
        <CustomSelect<number>
          value={pageSize}
          onChange={(val) => onPageSizeChange(val)}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
          size="sm"
          className="w-20"
          direction="auto"
        />
      </div>

      <div className="flex items-center justify-center gap-1 sm:justify-self-center">
        <button onClick={() => onPageChange(1)} disabled={page === 1} className={nav} title="First page">
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className={nav} title="Previous">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-7 h-7 px-2 rounded-lg text-xs font-semibold transition-all ${p === page
                  ? "bg-gradient-to-br from-[#00c6ff] to-[#0072ff] text-white shadow-[0_0_12px_rgba(0,198,255,0.4)]"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-sky-600 dark:hover:text-sky-400"
                }`}
            >
              {p}
            </button>
          )
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className={nav} title="Next">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} className={nav} title="Last page">
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="text-slate-500 dark:text-slate-400 sm:justify-self-end">
        Showing {from}–{to} of {totalItems}
      </div>
    </div>
  );
}
