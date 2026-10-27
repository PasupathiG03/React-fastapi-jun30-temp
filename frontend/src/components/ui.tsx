// Shared class strings and tiny building blocks, so buttons and row actions look the same on every screen.

/** Brand gradient button (index.css adds the hover lift / press). */
export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_4px_14px_rgba(14,165,233,0.3)] transition-all disabled:opacity-60 disabled:cursor-not-allowed";

/** Glass secondary button, e.g. Bulk Import next to Add User. */
export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 glass-btn border border-slate-200 dark:border-white/10 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-60";

interface RowActionButtonProps {
  /** Read by screen readers and shown as the tooltip, e.g. "Edit Admin". */
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  children: React.ReactNode;
}

/** Icon-only action in a table row: a real button with a label and a comfortable tap target. */
export function RowActionButton({ label, onClick, tone = "default", disabled, children }: RowActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tone === "danger"
        ? "text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
        : "text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10"
        }`}
    >
      {children}
    </button>
  );
}
