import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Loader2,
  FileText,
  ShieldAlert,
  Maximize2,
  Download,
} from "lucide-react";
import Modal, { ModalBody, ModalFooter, ModalCancelButton } from "@/components/Modal";
import type { InspectionResponse } from "@/services/bigbasket";

function formatReportFilename(batchTitle: string | undefined, reportName: string): string {
  const cleanTitle = (batchTitle || "batch")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const dateStr = new Date().toISOString().split("T")[0];
  return `${cleanTitle}_${reportName}_${dateStr}.csv`;
}

function downloadLowResReport(
  items: InspectionResponse["items"],
  targetWidth = 1500,
  targetHeight = 1500,
  batchTitle?: string
) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "Filename",
    "Width (px)",
    "Height (px)",
    "Required Width (px)",
    "Required Height (px)",
    "Width short by",
    "Height short by",
    "Megapixels",
    "Format",
    "Size (KB)",
    "Issue",
  ];
  const rows = items.map((it) => [
    it.filename,
    it.width,
    it.height,
    it.required_width ?? targetWidth,
    it.required_height ?? targetHeight,
    it.width_shortfall ?? Math.max(0, (it.required_width ?? targetWidth) - it.width),
    it.height_shortfall ?? Math.max(0, (it.required_height ?? targetHeight) - it.height),
    it.megapixels ?? "",
    it.format ?? "",
    it.file_size_bytes != null ? (it.file_size_bytes / 1024).toFixed(1) : "",
    it.error ? "Unreadable image" : "Below required dimensions",
  ]);
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = formatReportFilename(batchTitle, "low_resolution_report");
  a.click();
  URL.revokeObjectURL(url);
}

function downloadHundredPercentReport(items: InspectionResponse["items"], batchTitle?: string) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "Filename",
    "Detected 100% Claim",
    "OCR Confidence (%)",
    "Width (px)",
    "Height (px)",
    "Format",
    "Size (KB)",
  ];
  const rows: (string | number)[][] = [];
  items.forEach((it) => {
    if (it.hundred_percent_matches && it.hundred_percent_matches.length > 0) {
      it.hundred_percent_matches.forEach((m) => {
        rows.push([
          it.filename,
          m.text,
          `${(m.confidence * 100).toFixed(1)}%`,
          it.width,
          it.height,
          it.format ?? "",
          it.file_size_bytes != null ? (it.file_size_bytes / 1024).toFixed(1) : "",
        ]);
      });
    } else {
      rows.push([
        it.filename,
        "100% claim detected",
        "",
        it.width,
        it.height,
        it.format ?? "",
        it.file_size_bytes != null ? (it.file_size_bytes / 1024).toFixed(1) : "",
      ]);
    }
  });

  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = formatReportFilename(batchTitle, "100_percent_claims_report");
  a.click();
  URL.revokeObjectURL(url);
}

interface ImageInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  inspectionData: InspectionResponse | null;
  targetWidth?: number;
  targetHeight?: number;
  isLoading?: boolean;
  isUploading?: boolean;
  batchTitle?: string;
}

export default function ImageInspectionModal({
  isOpen,
  onClose,
  onConfirm,
  inspectionData,
  targetWidth = 1500,
  targetHeight = 1500,
  isLoading = false,
  isUploading = false,
  batchTitle,
}: ImageInspectionModalProps) {
  if (!isOpen) return null;

  const reqW = inspectionData?.required_width ?? targetWidth;
  const reqH = inspectionData?.required_height ?? targetHeight;
  const items = inspectionData?.items || [];
  const invalidDimensionItems = items.filter((it) => !it.is_dimension_valid);
  const hundredPercentItems = items.filter((it) => it.has_hundred_percent);

  return (
    <Modal
      onClose={onClose}
      title="Image Pre-Upload Inspection"
      subtitle="Resolution check & 100% claim detection"
      icon={Sparkles}
      size="2xl"
    >
      <ModalBody>
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 animate-spin">
              <Loader2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Inspecting Image Quality & Claims...
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Verifying dimensions and scanning packaging for any 100% product text.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary Highlights */}
            <div className={`grid gap-3 ${invalidDimensionItems.length > 0 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
              {/* Resolution Warning Card - only rendered when images fail dimension check */}
              {invalidDimensionItems.length > 0 && (
                <div className="p-3.5 rounded-xl border flex items-start gap-3 bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300">
                  <div className="p-2 rounded-lg bg-white/40 dark:bg-black/20 shrink-0 mt-0.5">
                    <Maximize2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">
                      {invalidDimensionItems.length} Image(s) Below Required Dimensions
                    </div>
                    <div className="text-[11px] opacity-85 mt-0.5">
                      Catalog standards require higher resolution for this batch.
                    </div>
                  </div>
                </div>
              )}

              {/* 100% Claims Card */}
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  hundredPercentItems.length > 0
                    ? "bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300"
                    : "bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div className="p-2 rounded-lg bg-white/40 dark:bg-black/20 shrink-0 mt-0.5">
                  <ShieldAlert className="w-4 h-4 text-purple-500" />
                </div>
                <div>
                  <div className="text-xs font-bold">
                    {hundredPercentItems.length > 0
                      ? `${hundredPercentItems.length} Image(s) with '100%' Claim`
                      : "No '100%' Claims Found"}
                  </div>
                  <div className="text-[11px] opacity-85 mt-0.5">
                    {hundredPercentItems.length > 0
                      ? "Flagged packaging containing '100%' statements for reviewer verification."
                      : "No '100%' composition or marketing claims detected in the package text."}
                  </div>
                </div>
              </div>
            </div>

            {/* Low-resolution report */}
            {invalidDimensionItems.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Images not meeting {reqW}×{reqH}px ({invalidDimensionItems.length} of {items.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadLowResReport(invalidDimensionItems, reqW, reqH, batchTitle)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </button>
                </div>
                <div className="max-h-56 overflow-auto rounded-lg border border-amber-200 dark:border-amber-900/40 bg-white dark:bg-slate-900">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 text-left">
                      <tr>
                        <th className="px-2.5 py-1.5 font-semibold">File</th>
                        <th className="px-2.5 py-1.5 font-semibold">Current</th>
                        <th className="px-2.5 py-1.5 font-semibold">Short by</th>
                        <th className="px-2.5 py-1.5 font-semibold">MP</th>
                        <th className="px-2.5 py-1.5 font-semibold">Format</th>
                        <th className="px-2.5 py-1.5 font-semibold">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-slate-800 dark:text-slate-200">
                      {invalidDimensionItems.map((it, i) => (
                        <tr key={i}>
                          <td className="px-2.5 py-1.5 max-w-[180px] truncate" title={it.filename}>{it.filename}</td>
                          <td className="px-2.5 py-1.5 font-mono text-amber-700 dark:text-amber-400">
                            {it.error ? "Unreadable" : `${it.width} × ${it.height}`}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono">
                            {it.error ? "-" : `${it.width_shortfall ?? Math.max(0, reqW - it.width)} × ${it.height_shortfall ?? Math.max(0, reqH - it.height)}`}
                          </td>
                          <td className="px-2.5 py-1.5">{it.megapixels ?? "-"}</td>
                          <td className="px-2.5 py-1.5">{it.format ?? "-"}</td>
                          <td className="px-2.5 py-1.5">
                            {it.file_size_bytes != null ? `${(it.file_size_bytes / 1024).toFixed(0)} KB` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 100% Claims Warning Box if any */}
            {hundredPercentItems.length > 0 && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400">
                    <Sparkles className="w-4 h-4" />
                    <span>Detected '100%' Product Packaging Claims ({hundredPercentItems.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadHundredPercentReport(hundredPercentItems, batchTitle)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-purple-500/30 text-purple-700 dark:text-purple-300 hover:bg-purple-500/10 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </button>
                </div>
                <div className="space-y-2">
                  {hundredPercentItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-purple-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {item.filename}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.hundred_percent_matches.map((m, mIdx) => (
                          <span
                            key={mIdx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20"
                            title={`Confidence: ${(m.confidence * 100).toFixed(1)}%`}
                          >
                            <span className="font-bold">&ldquo;{m.text}&rdquo;</span>
                            <span className="text-[10px] opacity-75">
                              ({(m.confidence * 100).toFixed(0)}%)
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dimension Breakdown Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Image Resolution Breakdown ({items.length} files)</span>
                </h4>
                <span className="text-[11px] text-slate-500">Threshold: ≥ {reqW} × {reqH} px</span>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/[0.06] bg-white dark:bg-slate-900">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.is_dimension_valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate">
                          {item.filename}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.dimension_message}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          item.is_dimension_valid
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {item.width} × {item.height} px
                      </span>
                      {item.has_hundred_percent && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          100%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading || isUploading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-md shadow-sky-500/20 disabled:opacity-50 transition-all cursor-pointer"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Uploading & Processing...</span>
            </>
          ) : (
            <>
              <span>
                {invalidDimensionItems.length > 0 || hundredPercentItems.length > 0
                  ? "Acknowledge & Proceed"
                  : "Proceed with Batch"}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

