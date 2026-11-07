import { useEffect, useState } from "react";
import { useSearchParams, useLocation, useNavigate, Link } from "react-router-dom";
import {
  Layers,
  Play,
  Pause,
  XCircle,
  Eye,
  Search,
  Table as TableIcon,
  LayoutGrid,
  Trash2,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import {
  fetchBatches,
  fetchBatchDetails,
  fetchBatchImages,
  startBatchProcessing,
  pauseBatchProcessing,
  resumeBatchProcessing,
  cancelBatchProcessing,
  deleteBatch,
  getImageFileUrl,
  type BatchItem,
  type ImageItem,
} from "@/services/bigbasket";
import { showError, showSuccess } from "@/lib/toast";

export default function BatchProcessing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const stateBatchId = (location.state as any)?.batchId;
  const queryBatchId = searchParams.get("batch_id") ? Number(searchParams.get("batch_id")) : null;
  const activeBatchId = stateBatchId || queryBatchId;

  // Clean URL if user arrived via direct link with ?batch_id=
  useEffect(() => {
    if (searchParams.has("batch_id")) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchItem | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);

  const [viewType, setViewType] = useState<"table" | "grid">("table");

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      loadImages(selectedBatch.id, page, statusFilter, searchTerm);
    }
  }, [selectedBatch, page, statusFilter, searchTerm]);

  // Polling sync every 3 seconds while processing
  useEffect(() => {
    if (!selectedBatch || selectedBatch.status !== "processing") return;
    const interval = setInterval(async () => {
      try {
        const updated = await fetchBatchDetails(selectedBatch.id);
        setSelectedBatch(updated);
        const imgData = await fetchBatchImages(selectedBatch.id, page, 50, statusFilter, searchTerm);
        setImages(imgData.items);
      } catch { }
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedBatch?.id, selectedBatch?.status, page, statusFilter, searchTerm]);

  async function loadBatches() {
    try {
      const data = await fetchBatches(1, 50);
      setBatches(data.items);
      if (data.items.length > 0) {
        const match = activeBatchId ? data.items.find((b) => b.id === activeBatchId) : data.items[0];
        setSelectedBatch(match || data.items[0]);
      }
    } catch (e: any) {
      showError(e.message || "Failed to load batches");
    }
  }

  async function loadImages(batchId: number, pg = 1, stat = "", srch = "") {
    try {
      const data = await fetchBatchImages(batchId, pg, 50, stat || undefined, srch || undefined);
      setImages(data.items);
    } catch { }
  }

  async function handleStart() {
    if (!selectedBatch) return;
    setActionLoading(true);
    try {
      await startBatchProcessing(selectedBatch.id);
      showSuccess("Batch processing started!");
      setSelectedBatch({ ...selectedBatch, status: "processing" });
      loadImages(selectedBatch.id, page, statusFilter, searchTerm);
    } catch (e: any) {
      showError(e.message || "Failed to start batch");
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePause() {
    if (!selectedBatch) return;
    try {
      await pauseBatchProcessing(selectedBatch.id);
      showSuccess("Pause requested for batch.");
      setSelectedBatch({ ...selectedBatch, status: "paused" });
    } catch (e: any) {
      showError(e.message || "Failed to pause batch");
    }
  }

  async function handleResume() {
    if (!selectedBatch) return;
    try {
      await resumeBatchProcessing(selectedBatch.id);
      showSuccess("Resumed batch processing!");
      setSelectedBatch({ ...selectedBatch, status: "processing" });
    } catch (e: any) {
      showError(e.message || "Failed to resume batch");
    }
  }

  async function handleCancel() {
    if (!selectedBatch) return;
    try {
      await cancelBatchProcessing(selectedBatch.id);
      showSuccess("Batch cancelled.");
      setSelectedBatch({ ...selectedBatch, status: "cancelled" });
    } catch (e: any) {
      showError(e.message || "Failed to cancel batch");
    }
  }

  async function handleDeleteBatch() {
    if (!selectedBatch) return;
    const confirmed = window.confirm(
      `Permanently delete batch "${selectedBatch.batch_code}"?\n\nThis will completely delete all uploaded original images, processed results, and database records from both disk and the database.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      await deleteBatch(selectedBatch.id);
      showSuccess(`Batch ${selectedBatch.batch_code} completely deleted from uploaded files and database.`);
      const remaining = batches.filter((b) => b.id !== selectedBatch.id);
      setBatches(remaining);
      if (remaining.length > 0) {
        setSelectedBatch(remaining[0]);
      } else {
        setSelectedBatch(null);
        setImages([]);
      }
    } catch (e: any) {
      showError(e.message || "Failed to delete batch");
    } finally {
      setActionLoading(false);
    }
  }

  const progressPct =
    selectedBatch && selectedBatch.total_images > 0
      ? selectedBatch.status === "completed"
        ? 100
        : Math.min(100, Math.round((selectedBatch.processed_images / selectedBatch.total_images) * 100))
      : 0;

  return (
    <PageContainer>
      <PageHeader
        icon={Layers}
        title="Batch Processing Monitor"
        subtitle="Track background execution, live confidence scores, and inspect background removal logic"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={selectedBatch?.id || ""}
              onChange={(e) => {
                const b = batches.find((x) => x.id === Number(e.target.value));
                if (b) {
                  setSelectedBatch(b);
                }
              }}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 cursor-pointer transition-colors"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {b.batch_code} - {b.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {selectedBatch && (
        <>
          {/* Batch Status Bar */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedBatch.batch_code}: {selectedBatch.name}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
                      selectedBatch.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : selectedBatch.status === "processing"
                        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 animate-pulse"
                        : selectedBatch.status === "paused"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20"
                    }`}
                  >
                    {selectedBatch.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Total {selectedBatch.total_images} items | {selectedBatch.approved_images} Approved |{" "}
                  {selectedBatch.review_needed_images} Awaiting Review | {selectedBatch.failed_images} Failed
                </p>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2">
                {selectedBatch.status === "created" && (
                  <button type="button" onClick={handleStart} disabled={actionLoading} className={PRIMARY_BUTTON}>
                    <Play className="w-4 h-4" /> Start Processing
                  </button>
                )}
                {selectedBatch.status === "processing" && (
                  <button type="button" onClick={handlePause} className={SECONDARY_BUTTON}>
                    <Pause className="w-4 h-4" /> Pause
                  </button>
                )}
                {selectedBatch.status === "paused" && (
                  <button type="button" onClick={handleResume} className={PRIMARY_BUTTON}>
                    <Play className="w-4 h-4" /> Resume
                  </button>
                )}
                {["created", "processing", "paused"].includes(selectedBatch.status) && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20"
                  >
                    <XCircle className="w-4 h-4" /> Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteBatch}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 shadow-2xs transition-colors"
                  title="Permanently delete this batch from disk storage and database"
                >
                  <Trash2 className="w-4 h-4" /> Delete Batch
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>Progress: {progressPct}%</span>
                <span>
                  {selectedBatch.status === "completed"
                    ? `${selectedBatch.total_images} / ${selectedBatch.total_images}`
                    : `${selectedBatch.processed_images} / ${selectedBatch.total_images}`}{" "}
                  Images Completed
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Filter Bar & View Mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search SKU ID or filename..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 cursor-pointer transition-colors"
              >
                <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Statuses</option>
                <option value="auto_approved" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Auto Approved</option>
                <option value="manually_approved" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Manually Approved</option>
                <option value="needs_review" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Needs Review</option>
                <option value="processing" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Processing</option>
                <option value="pending" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Pending</option>
                <option value="failed" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Failed</option>
              </select>

              {/* View Format Switcher (Table vs Grid) */}
              <div className="inline-flex items-center rounded-xl p-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setViewType("table")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewType === "table"
                      ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>Table Format</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewType("grid")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewType === "grid"
                      ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid Format</span>
                </button>
              </div>
            </div>
          </div>

          {/* TABLE FORMAT VIEW */}
          {viewType === "table" && (
            <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/80 dark:border-white/10 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/75 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4 w-16">Preview</th>
                      <th className="py-3 px-4">Product SKU / ID</th>
                      <th className="py-3 px-4">Original Filename</th>
                      <th className="py-3 px-4">Angle / View</th>
                      <th className="py-3 px-4">Processing Status</th>
                      <th className="py-3 px-4">AI Confidence</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {images.map((img) => (
                      <tr
                        key={img.id}
                        className="hover:bg-sky-500/5 dark:hover:bg-white/[0.02] transition-colors cursor-pointer group"
                        onClick={() => navigate("/image-studio/review-studio", { state: { imageId: img.id } })}
                        title="Click to open in Review Studio"
                      >
                        {/* Thumbnail */}
                        <td className="py-2.5 px-4">
                          <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 overflow-hidden flex items-center justify-center relative shadow-xs shrink-0">
                            <img
                              src={getImageFileUrl(img.id, img.status.includes("approved") ? "final" : "original")}
                              alt={img.original_filename}
                              className="max-h-full max-w-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><text x='15' y='55' font-size='12' fill='%23999'>No Img</text></svg>";
                              }}
                            />
                          </div>
                        </td>

                        {/* Product SKU */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                            {img.bbid}
                          </span>
                        </td>

                        {/* Filename */}
                        <td className="py-3 px-4 max-w-xs">
                          <span className="text-slate-600 dark:text-slate-300 truncate block font-medium" title={img.original_filename}>
                            {img.original_filename}
                          </span>
                        </td>

                        {/* Angle / View */}
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                            {img.image_type} #{img.sequence_order}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              img.status.includes("approved")
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : img.status === "needs_review"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : img.status === "processing"
                                ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 animate-pulse"
                                : img.status === "failed"
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                : "bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20"
                            }`}
                          >
                            {img.status.replace("_", " ")}
                          </span>
                        </td>

                        {/* Confidence */}
                        <td className="py-3 px-4">
                          {img.confidence_score !== null ? (
                            <div className="flex items-center gap-1.5 font-semibold text-xs">
                              <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    (img.confidence_score || 0) >= 0.95 ? "bg-emerald-500" : "bg-amber-500"
                                  }`}
                                  style={{ width: `${Math.round((img.confidence_score || 0) * 100)}%` }}
                                />
                              </div>
                              <span
                                className={
                                  (img.confidence_score || 0) >= 0.95
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }
                              >
                                {Math.round((img.confidence_score || 0) * 100)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <Link
                            to="/image-studio/review-studio"
                            state={{ imageId: img.id }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Studio</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GRID FORMAT VIEW */}
          {viewType === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map((img) => (
                <div key={img.id} className="glass-card rounded-2xl p-3.5 flex flex-col justify-between space-y-3">
                  {/* Image Thumbnail Preview */}
                  <div
                    className="relative aspect-square rounded-xl bg-slate-100 dark:bg-slate-900/60 overflow-hidden flex items-center justify-center border border-slate-200/60 dark:border-white/5 cursor-pointer group"
                    onClick={() => navigate("/image-studio/review-studio", { state: { imageId: img.id } })}
                    title="Click to open in Review Studio"
                  >
                    <img
                      src={getImageFileUrl(img.id, img.status.includes("approved") ? "final" : "original")}
                      alt={img.original_filename}
                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><text x='20' y='55' fill='%23999'>No Preview</text></svg>";
                      }}
                    />
                    <span
                      className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
                        img.status.includes("approved")
                          ? "bg-emerald-500/80 text-white"
                          : img.status === "needs_review"
                          ? "bg-amber-500/80 text-white"
                          : img.status === "failed"
                          ? "bg-rose-500/80 text-white"
                          : "bg-slate-500/80 text-white"
                      }`}
                    >
                      {img.status.replace("_", " ")}
                    </span>
                  </div>

                  {/* Metadata Details */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        ID: {img.bbid}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5">
                        {img.image_type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate" title={img.original_filename}>
                      {img.original_filename}
                    </p>
                    {img.confidence_score !== null && (
                      <div className="flex justify-between items-center text-[11px] pt-1">
                        <span className="text-slate-400">Confidence:</span>
                        <span
                          className={`font-semibold ${
                            (img.confidence_score || 0) >= 0.95 ? "text-emerald-500" : "text-amber-500"
                          }`}
                        >
                          {Math.round((img.confidence_score || 0) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-end">
                    <Link
                      to="/image-studio/review-studio"
                      state={{ imageId: img.id }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Studio</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {images.length === 0 && (
            <div className="text-center py-12 glass-card rounded-2xl text-slate-400 text-xs">
              No images found matching your search and filter criteria.
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
