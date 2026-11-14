import PageContainer from "@/components/PageContainer";

interface GlobalPageLoaderProps {
  /** Number of stat/KPI cards to display (default: 4, pass 0 to hide) */
  cardsCount?: number;
  /** Number of skeleton rows to display in main content card (default: 5) */
  rowsCount?: number;
  className?: string;
}

/**
 * Universal Global KPI Metric Cards Skeleton Loader.
 */
export function GlobalKpiSkeleton({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 ${
        count >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
      } gap-3.5 sm:gap-4 ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card rounded-2xl p-4 sm:p-5 flex items-center justify-between animate-pulse">
          <div className="space-y-2 flex-1">
            <div className="h-3 w-24 bg-slate-200 dark:bg-white/10 rounded" />
            <div className="h-7 w-16 bg-slate-200 dark:bg-white/10 rounded-md" />
            <div className="h-2.5 w-28 bg-slate-100 dark:bg-white/5 rounded" />
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-white/10 shrink-0 ml-3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Universal Global Table Rows Skeleton Loader.
 * For div-based tables or list containers.
 */
export function GlobalTableSkeleton({
  rows = 5,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`divide-y divide-slate-100 dark:divide-white/[0.04] animate-pulse ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="h-3.5 w-36 bg-slate-200 dark:bg-white/10 rounded" />
              <div className="h-2.5 w-52 max-w-full bg-slate-100 dark:bg-white/5 rounded" />
            </div>
          </div>
          <div className="hidden sm:block h-5 w-20 rounded-full bg-slate-200 dark:bg-white/10 shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10" />
            <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Universal Global Table <tbody> Row Skeleton Loader.
 * Safely renders semantic <tr> and <td> cells inside standard <tbody> elements.
 */
export function GlobalTableRowSkeleton({
  rows = 5,
  cols = 5,
  className = "",
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className={`animate-pulse border-b border-slate-100 dark:border-white/[0.04] ${className}`} aria-hidden="true">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="py-3 px-4">
              <div
                className="h-3.5 bg-slate-200 dark:bg-white/10 rounded"
                style={{ width: `${Math.max(30, 85 - ((r * 19 + c * 23) % 50))}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Universal Global Modal Content Skeleton Loader.
 * Replaces ad-hoc inline modal skeletons across all dialogs.
 */
export function GlobalModalLoader({
  lines = 4,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`p-6 space-y-4 animate-pulse ${className}`} aria-hidden="true">
      <div className="space-y-2">
        <div className="h-4 w-48 bg-slate-200 dark:bg-white/10 rounded-md" />
        <div className="h-3 w-72 bg-slate-100 dark:bg-white/5 rounded" />
      </div>
      <div className="h-28 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/50 dark:border-white/5 p-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-slate-200/80 dark:bg-white/10 rounded"
            style={{ width: `${Math.max(40, 90 - i * 15)}%` }}
          />
        ))}
      </div>
      <span className="sr-only" role="status">Loading dialog details...</span>
    </div>
  );
}

/**
 * Universal Global Inline Spinner Loader.
 */
export function GlobalInlineLoader({
  text = "Loading...",
  className = "",
}: {
  text?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-sky-500 font-medium ${className}`}>
      <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-sky-500 animate-spin shrink-0" />
      {text && <span>{text}</span>}
    </span>
  );
}

/**
 * Universal Global Page Skeleton Loader.
 * Reused across all routes and pages during initial data fetching or chunk suspense.
 */
export function GlobalPageLoader({
  cardsCount = 4,
  rowsCount = 5,
  className = "",
}: GlobalPageLoaderProps) {
  return (
    <PageContainer className={className}>
      {/* Universal Page Header Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3" aria-hidden="true">
        <div className="flex items-center gap-3.5 min-w-0 flex-1 basis-60">
          <div className="w-11 h-11 rounded-2xl bg-slate-200 dark:bg-white/10 animate-pulse shrink-0" />
          <div className="min-w-0 space-y-1.5 flex-1">
            <div className="h-5 w-44 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse" />
            <div className="h-3 w-64 max-w-full bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2.5">
          <div className="h-9 w-24 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" />
          <div className="h-9 w-32 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" />
        </div>
      </div>

      {/* KPI Metric Overview Cards Skeleton */}
      {cardsCount > 0 && <GlobalKpiSkeleton count={cardsCount} />}

      {/* Main Content Area / Table Skeleton Card */}
      <div className="glass-card rounded-[22px] overflow-hidden border border-slate-200/80 dark:border-white/10 shadow-sm" aria-hidden="true">
        {/* Table Toolbar Skeleton */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="h-5 w-28 bg-slate-200 dark:bg-white/10 rounded" />
            <div className="h-4 w-12 bg-slate-100 dark:bg-white/5 rounded" />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-52 rounded-xl bg-slate-200 dark:bg-white/10" />
            <div className="h-9 w-20 rounded-xl bg-slate-200 dark:bg-white/10" />
          </div>
        </div>

        {/* Rows Skeleton */}
        <GlobalTableSkeleton rows={rowsCount} />

        {/* Pagination Skeleton */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between animate-pulse">
          <div className="h-3 w-24 bg-slate-100 dark:bg-white/5 rounded" />
          <div className="h-6 w-40 bg-slate-200 dark:bg-white/10 rounded-lg" />
        </div>
      </div>

      <span className="sr-only" role="status">Loading page content...</span>
    </PageContainer>
  );
}

export default GlobalPageLoader;
