import React from "react";

interface PageHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  // True while the page's first data request is still in flight: the icon, title and subtitle (and any
  // actions) become skeleton bars instead, so the whole page reads as "loading", not half static/half not.
  loading?: boolean;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, loading = false }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3.5 min-w-0">
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white ${loading
            ? "bg-slate-200 dark:bg-white/10 animate-pulse"
            : "bg-gradient-to-br from-[#00c6ff] to-[#0072ff] shadow-[0_0_20px_rgba(0,198,255,0.45)]"
            }`}
        >
          {!loading && <Icon className="w-5 h-5 drop-shadow-sm" />}
        </div>
        <div className="min-w-0 space-y-1.5">
          {loading ? (
            <>
              <div className="h-5 w-44 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse" />
              {subtitle !== undefined && (
                <div className="h-3 w-64 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
              )}
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {actions && (
        <div className="shrink-0 flex items-center gap-3">
          {loading ? <div className="h-9 w-36 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" /> : actions}
        </div>
      )}
    </div>
  );
}

export default function PageContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full px-3.5 sm:px-4 py-2 pb-8 space-y-5 ${className}`}>
      {children}
    </div>
  );
}
