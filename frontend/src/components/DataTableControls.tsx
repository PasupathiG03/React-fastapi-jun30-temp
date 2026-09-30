import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Search, X } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "@/hooks/useTableData";

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
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-52 pl-8 pr-7 py-1.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-gray-600 transition-colors shadow-sm"
          title="Export to CSV"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      )}
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
    "w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="px-6 py-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 items-center gap-3 bg-white">
      <div className="flex items-center gap-2 text-sm text-gray-500 sm:justify-self-start">
        <span>Per page:</span>
        <div className="relative">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="appearance-none text-sm text-gray-800 border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      <div className="flex items-center justify-center gap-1 sm:justify-self-center">
        <button onClick={() => onPageChange(1)} disabled={page === 1} className={nav} title="First page">
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className={nav} title="Previous">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-gray-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-8 h-8 px-2 rounded-lg text-sm font-semibold transition-colors ${
                p === page ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-blue-600"
              }`}
              style={p === page ? { background: "linear-gradient(135deg, #1d55e8, #1235b0)" } : undefined}
            >
              {p}
            </button>
          )
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className={nav} title="Next">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} className={nav} title="Last page">
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>

      <div className="text-sm text-gray-500 sm:justify-self-end">
        Showing {from}–{to} of {totalItems}
      </div>
    </div>
  );
}
