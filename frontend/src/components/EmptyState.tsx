interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: React.ReactNode;
  /** Usually the page's primary button, e.g. "Add Role". */
  action?: React.ReactNode;
  /** Tighter padding for use inside a panel rather than a whole table. */
  compact?: boolean;
  className?: string;
}

/** "Nothing here yet" block for tables and panels: soft icon tile, one line, optional next step. */
export default function EmptyState({ icon: Icon, title, description, action, compact = false, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? "py-8" : "py-14"} ${className}`}>
      <div
        className={`${compact ? "w-11 h-11 mb-3" : "w-14 h-14 mb-4"} rounded-2xl flex items-center justify-center bg-sky-500/10 dark:bg-sky-400/10 text-sky-500 dark:text-sky-400 ring-1 ring-sky-500/15 dark:ring-sky-400/15`}
      >
        <Icon className={compact ? "w-5 h-5" : "w-6 h-6"} />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
