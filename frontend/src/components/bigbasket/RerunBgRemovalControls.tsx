import React from "react";
import { AlertTriangle, Cpu, Download, RotateCcw } from "lucide-react";

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
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap text-white bg-sky-600 hover:bg-sky-500 shadow-sm transition-all disabled:opacity-50 ${className}`}
      title="Rerun background removal using Photoroom API"
    >
      <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${loading ? "animate-spin" : ""}`} />
      <span>{loading ? "Rerunning..." : "Rerun Cloud AI"}</span>
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
    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900 shadow-sm transition-all disabled:opacity-50 ${className}`}
    title="Rerun background removal locally using BiRefNet"
  >
    <Cpu className={`w-3.5 h-3.5 shrink-0 ${loading ? "animate-spin" : ""}`} />
    <span>{loading ? "Running..." : "Rerun Local AI"}</span>
  </button>
);

interface DownloadOutputImageButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const DownloadOutputImageButton: React.FC<DownloadOutputImageButtonProps> = ({
  onClick,
  loading = false,
  disabled = false,
  className = "",
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading || disabled}
    className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 border border-slate-200 dark:border-white/10 shadow-sm transition-all disabled:opacity-50 cursor-pointer ${className}`}
    title="Download standardized output image PNG"
  >
    <Download className={`w-3.5 h-3.5 shrink-0 ${loading ? "animate-spin" : ""}`} />
    <span>{loading ? "Downloading..." : "Download"}</span>
  </button>
);

interface BgRemovalErrorBannerProps {
  errorMessage?: string | null;
  onRerunCloud?: () => void;
  onRerunLocal?: () => void;
  loadingCloud?: boolean;
  loadingLocal?: boolean;
  // Backward compatibility
  onRerun?: () => void;
  loading?: boolean;
}

export const BgRemovalErrorBanner: React.FC<BgRemovalErrorBannerProps> = ({
  errorMessage,
  onRerunCloud,
  onRerunLocal,
  loadingCloud = false,
  loadingLocal = false,
  onRerun,
  loading = false,
}) => {
  if (!errorMessage) return null;

  const handleCloud = onRerunCloud || onRerun;
  const isCloudLoading = loadingCloud || loading;

  const isPhotoroomError =
    errorMessage.toLowerCase().includes("photoroom") ||
    errorMessage.toLowerCase().includes("api_key") ||
    errorMessage.toLowerCase().includes("cloud");

  const isLocalError =
    errorMessage.toLowerCase().includes("birefnet") ||
    errorMessage.toLowerCase().includes("local") ||
    errorMessage.toLowerCase().includes("u2net");

  const title = isPhotoroomError
    ? "Cloud AI (Photoroom) Background Removal Failed"
    : isLocalError
    ? "Local AI (BiRefNet) Background Removal Failed"
    : "Background Removal Failed";

  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-start gap-2.5 text-rose-700 dark:text-rose-300">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
        <div className="text-xs space-y-0.5">
          <div className="font-bold">{title}</div>
          <p className="text-rose-600 dark:text-rose-200/90 leading-relaxed">{errorMessage}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRerunLocal && (
          <RerunLocalModelButton onClick={onRerunLocal} loading={loadingLocal} disabled={isCloudLoading} />
        )}
        {handleCloud && (
          <RerunBgRemovalButton onClick={handleCloud} loading={isCloudLoading} disabled={loadingLocal} />
        )}
      </div>
    </div>
  );
};

