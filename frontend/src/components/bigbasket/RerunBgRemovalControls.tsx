import React from "react";
import { AlertTriangle, Cpu, RotateCcw } from "lucide-react";

interface RerunBgRemovalButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export const RerunBgRemovalButton: React.FC<RerunBgRemovalButtonProps> = ({
  onClick,
  loading = false,
  disabled = false,
  compact = false,
  className = "",
}) => {
  if (compact) {
    return (
      <button
        type="button"
        disabled={loading || disabled}
        onClick={onClick}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-sky-700 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900 transition-colors disabled:opacity-50 ${className}`}
        title="Rerun background removal using Photoroom API"
      >
        <RotateCcw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        <span>{loading ? "Rerunning..." : "Rerun Background Removal"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 shadow-sm transition-all disabled:opacity-50 ${className}`}
      title="Rerun background removal using Photoroom API"
    >
      <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
      <span>{loading ? "Rerunning Background Removal..." : "Rerun Background Removal"}</span>
    </button>
  );
};

interface RerunLocalModelButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const RerunLocalModelButton: React.FC<RerunLocalModelButtonProps> = ({
  onClick,
  loading = false,
  disabled = false,
  className = "",
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading || disabled}
    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900 shadow-sm transition-all disabled:opacity-50 ${className}`}
    title="Rerun background removal locally using RMBG-2.0"
  >
    <Cpu className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
    <span>{loading ? "Running Local Model..." : "Rerun Local Model"}</span>
  </button>
);

interface BgRemovalErrorBannerProps {
  errorMessage?: string | null;
  onRerun: () => void;
  loading?: boolean;
}

export const BgRemovalErrorBanner: React.FC<BgRemovalErrorBannerProps> = ({
  errorMessage,
  onRerun,
  loading = false,
}) => {
  if (!errorMessage) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-start gap-2.5 text-rose-700 dark:text-rose-300">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
        <div className="text-xs space-y-0.5">
          <div className="font-bold">Local Background Removal Failed</div>
          <p className="text-rose-600 dark:text-rose-200/90 leading-relaxed">{errorMessage}</p>
        </div>
      </div>
      <div className="shrink-0">
        <RerunBgRemovalButton onClick={onRerun} loading={loading} />
      </div>
    </div>
  );
};

