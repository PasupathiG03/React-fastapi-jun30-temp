import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  CheckSquare,
  Square,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import {
  fetchReviewQueue,
  submitBulkReview,
  getImageFileUrl,
  type ImageItem,
} from "@/services/bigbasket";
import { showError, showSuccess } from "@/lib/toast";

export default function ManualReviewQueue() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    setLoading(true);
    try {
      const data = await fetchReviewQueue(1, 50);
      setItems(data.items);
      setSelectedIds([]);
    } catch (e: any) {
      showError(e.message || "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAll() {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((i) => i.id));
    }
  }

  async function handleBulkAction(decision: "approved" | "rejected") {
    if (selectedIds.length === 0) return showError("Please select at least one image.");
    setActionLoading(true);
    try {
      await submitBulkReview(selectedIds, decision, "Bulk manual review action");
      showSuccess(`Successfully marked ${selectedIds.length} images as ${decision}.`);
      loadQueue();
    } catch (e: any) {
      showError(e.message || "Failed to process bulk review");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        icon={AlertTriangle}
        title="Manual Review Queue"
        subtitle="Review images flagged with low confidence scores or automated validation warnings"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkAction("approved")}
              disabled={actionLoading || selectedIds.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" /> Approve Selected ({selectedIds.length})
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction("rejected")}
              disabled={actionLoading || selectedIds.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-sm disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" /> Reject Selected ({selectedIds.length})
            </button>
          </div>
        }
      />

      {/* Select All Bar */}
      <div className="flex items-center justify-between glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={selectAll}
            className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            {selectedIds.length > 0 && selectedIds.length === items.length ? (
              <CheckSquare className="w-4 h-4 text-sky-500" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            Select All ({items.length})
          </button>
          <span className="text-xs text-slate-400">|</span>
          <span className="text-xs text-slate-500">
            {selectedIds.length} of {items.length} selected
          </span>
        </div>
      </div>

      {/* Review Queue Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((img) => {
          const isSelected = selectedIds.includes(img.id);
          return (
            <div
              key={img.id}
              className={`glass-card rounded-2xl p-4 flex flex-col justify-between space-y-3 transition-all ${
                isSelected ? "ring-2 ring-sky-500" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <button
                  type="button"
                  onClick={() => toggleSelect(img.id)}
                  className="flex items-center gap-2"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-sky-500" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    ID: {img.bbid}
                  </span>
                </button>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase tracking-wide">
                  {Math.round((img.confidence_score || 0) * 100)}% Confidence
                </span>
              </div>

              {/* Side-by-side preview */}
              <div className="grid grid-cols-2 gap-2 aspect-[2/1] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900/60 p-1">
                <div className="relative flex items-center justify-center overflow-hidden">
                  <img
                    src={getImageFileUrl(img.id, "original")}
                    alt="Original"
                    className="max-h-full max-w-full object-contain"
                  />
                  <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/60 text-white px-1 rounded">
                    Original
                  </span>
                </div>
                <div className="relative flex items-center justify-center overflow-hidden">
                  <img
                    src={getImageFileUrl(img.id, "final")}
                    alt="Processed"
                    className="max-h-full max-w-full object-contain"
                  />
                  <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/60 text-white px-1 rounded">
                    Result
                  </span>
                </div>
              </div>

              {/* Validation Failure Warnings */}
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <div className="flex justify-between">
                  <span>File:</span>
                  <span className="truncate max-w-[160px] font-medium text-slate-700 dark:text-slate-300">
                    {img.original_filename}
                  </span>
                </div>
                {img.error_message && (
                  <p className="text-rose-500 font-medium">{img.error_message}</p>
                )}
              </div>

              {/* Inspect Button */}
              <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex justify-end">
                <Link
                  to="/image-studio/review-studio"
                  state={{ imageId: img.id }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Open in Review Studio
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && items.length === 0 && (
        <div className="text-center py-16 glass-card rounded-2xl text-slate-400 text-xs">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          The manual review queue is clear! All images satisfy the confidence threshold.
        </div>
      )}
    </PageContainer>
  );
}
