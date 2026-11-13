import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  Layers,
  Play,
  Pause,
  XCircle,
  Eye,
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  PlusCircle,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Sliders,
  FileSpreadsheet,
  Upload,
  Zap,
  FolderArchive,
  Image as ImageIcon,
  CheckCircle,
  BarChart3,
  RotateCcw,
  Maximize2,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { TablePagination } from "@/components/DataTableControls";
import Modal, { ModalBody, ModalFooter, ModalCancelButton, ConfirmDialog } from "@/components/Modal";
import {
  fetchBatches,
  fetchBatchImages,
  startBatchProcessing,
  pauseBatchProcessing,
  resumeBatchProcessing,
  cancelBatchProcessing,
  deleteBatch,
  createBatch,
  uploadBatchImageFiles,
  uploadBatchImagesZip,
  inspectImageFiles,
  inspectImagesZip,
  fetchDashboardSummary,
  getImageFileUrl,
  downloadBatchZipFile,
  downloadBatchExcelFile,
  retryImageProcessing,
  retryBatchFailed,
  type BatchItem,
  type ImageItem,
  type DashboardSummary,
  type InspectionResponse,
} from "@/services/bigbasket";
import ImageInspectionModal from "@/components/bigbasket/ImageInspectionModal";
import { showError, showSuccess } from "@/lib/toast";

export default function BatchProcessing() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Clean URL if arrived via direct link with ?batch_id=
  useEffect(() => {
    if (searchParams.has("batch_id")) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Master batches state
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Expandable row state (always collapsed by default; only expands when user clicks)
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null);

  // Cache images per batch
  const [batchImages, setBatchImages] = useState<Record<number, ImageItem[]>>({});
  const [batchImagesLoading, setBatchImagesLoading] = useState<Record<number, boolean>>({});

  // Sub-table search & status filters per batch
  const [imageSearch, setImageSearch] = useState<Record<number, string>>({});
  const [imageStatusFilter, setImageStatusFilter] = useState<Record<number, string>>({});

  // Main table batch filters
  const [batchSearchTerm, setBatchSearchTerm] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Modal dialog states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<BatchItem | null>(null);
  const [batchToDownloadZip, setBatchToDownloadZip] = useState<BatchItem | null>(null);
  const [downloadingZipType, setDownloadingZipType] = useState<"approved" | "all" | null>(null);

  function handleInitiateZipDownload(batch: BatchItem) {
    // If the batch has review-needed images, prompt with modal options
    if (batch.review_needed_images > 0) {
      setBatchToDownloadZip(batch);
    } else {
      // Direct download of approved images if there are no pending reviews
      downloadBatchZipFile(batch.batch_code, undefined, false);
    }
  }

  async function handleConfirmZipDownload(includeAll: boolean) {
    if (!batchToDownloadZip) return;
    try {
      setDownloadingZipType(includeAll ? "all" : "approved");
      await downloadBatchZipFile(batchToDownloadZip.batch_code, undefined, includeAll);
      setBatchToDownloadZip(null);
    } catch (err) {
      console.error("Failed to download ZIP:", err);
    } finally {
      setDownloadingZipType(null);
    }
  }

  useEffect(() => {
    loadBatches(true);
  }, []);

  // When a batch is expanded, load its images if not yet loaded
  useEffect(() => {
    if (expandedBatchId) {
      loadImagesForBatch(
        expandedBatchId,
        imageStatusFilter[expandedBatchId] || "",
        imageSearch[expandedBatchId] || ""
      );
    }
  }, [expandedBatchId]);

  // Polling sync every 3 seconds if any batch is currently processing
  useEffect(() => {
    const hasActiveProcessing = batches.some((b) => b.status === "processing");
    if (!hasActiveProcessing) return;

    const interval = setInterval(async () => {
      try {
        const data = await fetchBatches(1, 100);
        setBatches(data.items);

        // If the currently expanded batch is processing, reload its images as well
        if (expandedBatchId) {
          const exp = data.items.find((b) => b.id === expandedBatchId);
          if (exp && exp.status === "processing") {
            const imgData = await fetchBatchImages(
              expandedBatchId,
              1,
              100,
              imageStatusFilter[expandedBatchId] || undefined,
              imageSearch[expandedBatchId] || undefined
            );
            setBatchImages((prev) => ({ ...prev, [expandedBatchId]: imgData.items }));
          }
        }
      } catch { }
    }, 3000);

    return () => clearInterval(interval);
  }, [batches, expandedBatchId, imageStatusFilter, imageSearch]);

  async function loadBatches(initial = false) {
    if (initial) setLoadingBatches(true);
    setRefreshing(true);
    try {
      const data = await fetchBatches(1, 100);
      setBatches(data.items);
    } catch (e: any) {
      showError(e.message || "Failed to load extraction batches");
    } finally {
      setLoadingBatches(false);
      setRefreshing(false);
    }
  }

  async function loadImagesForBatch(batchId: number, status = "", search = "") {
    setBatchImagesLoading((prev) => ({ ...prev, [batchId]: true }));
    try {
      const data = await fetchBatchImages(
        batchId,
        1,
        100,
        status || undefined,
        search || undefined
      );
      setBatchImages((prev) => ({ ...prev, [batchId]: data.items }));
    } catch (e: any) {
      showError(e.message || "Failed to load batch images");
    } finally {
      setBatchImagesLoading((prev) => ({ ...prev, [batchId]: false }));
    }
  }

  const [retryingImageId, setRetryingImageId] = useState<number | null>(null);
  const [retryingBatchId, setRetryingBatchId] = useState<number | null>(null);

  async function handleRetryImage(batchId: number, imageId: number) {
    setRetryingImageId(imageId);
    try {
      const res = await retryImageProcessing(imageId);
      showSuccess(`Photoroom re-processed SKU ${res.bbid || imageId}! Status: ${res.status.replace("_", " ").toUpperCase()}`);
      await loadImagesForBatch(batchId, imageStatusFilter[batchId] || "", imageSearch[batchId] || "");
      await loadBatches();
    } catch (e: any) {
      showError(e.message || "Failed to retry image with Photoroom");
    } finally {
      setRetryingImageId(null);
    }
  }

  async function handleRetryBatchFailed(batchId: number) {
    setRetryingBatchId(batchId);
    try {
      const res = await retryBatchFailed(batchId);
      showSuccess(res.message || `Retried failed images with Photoroom!`);
      await loadImagesForBatch(batchId, imageStatusFilter[batchId] || "", imageSearch[batchId] || "");
      await loadBatches();
    } catch (e: any) {
      showError(e.message || "Failed to retry batch images with Photoroom");
    } finally {
      setRetryingBatchId(null);
    }
  }

  function toggleExpand(batchId: number) {
    setExpandedBatchId((prev) => (prev === batchId ? null : batchId));
  }

  async function handleStart(batch: BatchItem) {
    setActionLoadingId(batch.id);
    try {
      await startBatchProcessing(batch.id);
      showSuccess(`Processing started for batch ${batch.batch_code}!`);
      setBatches((prev) =>
        prev.map((b) => (b.id === batch.id ? { ...b, status: "processing" } : b))
      );
      loadImagesForBatch(batch.id);
    } catch (e: any) {
      showError(e.message || "Failed to start batch processing");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handlePause(batch: BatchItem) {
    setActionLoadingId(batch.id);
    try {
      await pauseBatchProcessing(batch.id);
      showSuccess(`Batch ${batch.batch_code} paused.`);
      setBatches((prev) =>
        prev.map((b) => (b.id === batch.id ? { ...b, status: "paused" } : b))
      );
    } catch (e: any) {
      showError(e.message || "Failed to pause batch");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleResume(batch: BatchItem) {
    setActionLoadingId(batch.id);
    try {
      await resumeBatchProcessing(batch.id);
      showSuccess(`Batch ${batch.batch_code} resumed.`);
      setBatches((prev) =>
        prev.map((b) => (b.id === batch.id ? { ...b, status: "processing" } : b))
      );
    } catch (e: any) {
      showError(e.message || "Failed to resume batch");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleCancel(batch: BatchItem) {
    setActionLoadingId(batch.id);
    try {
      await cancelBatchProcessing(batch.id);
      showSuccess(`Batch ${batch.batch_code} cancelled.`);
      setBatches((prev) =>
        prev.map((b) => (b.id === batch.id ? { ...b, status: "cancelled" } : b))
      );
    } catch (e: any) {
      showError(e.message || "Failed to cancel batch");
    } finally {
      setActionLoadingId(null);
    }
  }

  function handleDelete(batch: BatchItem) {
    setBatchToDelete(batch);
  }

  async function confirmDeleteBatch() {
    if (!batchToDelete) return;
    const batch = batchToDelete;
    setActionLoadingId(batch.id);
    try {
      await deleteBatch(batch.id);
      showSuccess(`Batch ${batch.batch_code} deleted.`);
      setBatches((prev) => prev.filter((b) => b.id !== batch.id));
      if (expandedBatchId === batch.id) {
        setExpandedBatchId(null);
      }
      setBatchToDelete(null);
    } catch (e: any) {
      showError(e.message || "Failed to delete batch");
    } finally {
      setActionLoadingId(null);
    }
  }

  // Filter master batches list
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const matchesSearch =
        !batchSearchTerm.trim() ||
        b.batch_code.toLowerCase().includes(batchSearchTerm.toLowerCase()) ||
        b.name.toLowerCase().includes(batchSearchTerm.toLowerCase());
      const matchesStatus = !batchStatusFilter || b.status === batchStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [batches, batchSearchTerm, batchStatusFilter]);

  // Master batches pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / pageSize));

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [batchSearchTerm, batchStatusFilter]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pagedBatches = useMemo(() => {
    return filteredBatches.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredBatches, page, pageSize]);

  // Overall KPI metrics
  const totalBatchesCount = batches.length;
  const processingCount = batches.filter((b) => b.status === "processing").length;
  const completedCount = batches.filter((b) => b.status === "completed").length;
  const totalImagesProcessed = batches.reduce((acc, b) => acc + (b.processed_images || 0), 0);

  return (
    <PageContainer>
      <PageHeader
        icon={Sparkles}
        title="Image Studio"
        subtitle="End-to-end automated catalog standardization pipeline, live extraction monitor, and quality inspector"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsAnalyticsModalOpen(true)}
              className={SECONDARY_BUTTON}
              title="View Studio Analytics & Reports"
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Analytics</span>
            </button>
            <button
              type="button"
              onClick={() => loadBatches(false)}
              disabled={refreshing}
              className={SECONDARY_BUTTON}
              title="Refresh all batches"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className={PRIMARY_BUTTON}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create New Batch</span>
            </button>
          </div>
        }
      />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Total Extractions
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {totalBatchesCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              In Processing
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {processingCount}
              </span>
              {processingCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Completed Batches
            </p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {completedCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Images Standardized
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {totalImagesProcessed}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Batches Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search extraction batches by code or title..."
            value={batchSearchTerm}
            onChange={(e) => setBatchSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status:</span>
          <select
            value={batchStatusFilter}
            onChange={(e) => setBatchStatusFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 cursor-pointer transition-colors"
          >
            <option value="">All Batches</option>
            <option value="processing">Processing (Active)</option>
            <option value="completed">Completed</option>
            <option value="created">Created / Pending</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* MAIN EXTRACTIONS TABLE */}
      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/75 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 font-semibold text-xs">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-2 w-8 text-center"></th>
                <th className="py-3 px-4">Extraction Batch</th>
                <th className="py-3 px-4">Pipeline Status</th>
                <th className="py-3 px-4 w-48">Automation Progress</th>
                <th className="py-3 px-4">Standardization Quality</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {pagedBatches.map((batch, index) => {
                const isExpanded = expandedBatchId === batch.id;
                const progressPct =
                  batch.total_images > 0
                    ? batch.status === "completed"
                      ? 100
                      : Math.min(100, Math.round((batch.processed_images / batch.total_images) * 100))
                    : 0;

                return (
                  <BatchTableRow
                    key={batch.id}
                    index={(page - 1) * pageSize + index}
                    batch={batch}
                    isExpanded={isExpanded}
                    progressPct={progressPct}
                    actionLoading={actionLoadingId === batch.id}
                    onToggle={() => toggleExpand(batch.id)}
                    onStart={() => handleStart(batch)}
                    onPause={() => handlePause(batch)}
                    onResume={() => handleResume(batch)}
                    onCancel={() => handleCancel(batch)}
                    onDelete={() => handleDelete(batch)}
                    images={batchImages[batch.id] || []}
                    imagesLoading={batchImagesLoading[batch.id] || false}
                    onReloadImages={(status, search) => {
                      setImageStatusFilter((p) => ({ ...p, [batch.id]: status }));
                      setImageSearch((p) => ({ ...p, [batch.id]: search }));
                      loadImagesForBatch(batch.id, status, search);
                    }}
                    retryingImageId={retryingImageId}
                    retryingBatchId={retryingBatchId}
                    onRetryImage={(imageId) => handleRetryImage(batch.id, imageId)}
                    onRetryBatchFailed={() => handleRetryBatchFailed(batch.id)}
                    onDownloadZip={() => handleInitiateZipDownload(batch)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredBatches.length === 0 && !loadingBatches && (
          <div className="text-center py-16 px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">
              No Extraction Batches Found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {batchSearchTerm || batchStatusFilter
                ? "No extraction batches match your search filter criteria."
                : "No batches have been created yet. Upload a ZIP or image files to begin automated catalog standardization."}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className={PRIMARY_BUTTON}
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create First Batch</span>
              </button>
            </div>
          </div>
        )}

        {loadingBatches && (
          <div className="text-center py-16 text-slate-400 text-xs">
            Loading batch extractions...
          </div>
        )}

        {!loadingBatches && (
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            totalItems={filteredBatches.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* CREATE BATCH MODAL */}
      <CreateBatchModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(newBatch) => {
          setBatches((prev) => [newBatch, ...prev]);
        }}
      />

      {/* ANALYTICS MODAL */}
      <AnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
      />

      {/* DOWNLOAD ZIP SELECTION MODAL */}
      {batchToDownloadZip && (
        <Modal
          onClose={() => setBatchToDownloadZip(null)}
          title={`Download Images: ${batchToDownloadZip.batch_code}`}
          size="md"
        >
          <ModalBody>
            <div className="space-y-4 py-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                This batch contains{" "}
                <span className="font-bold text-amber-500">
                  {batchToDownloadZip.review_needed_images} item(s) awaiting review
                </span>{" "}
                and{" "}
                <span className="font-bold text-emerald-500">
                  {batchToDownloadZip.approved_images} approved item(s)
                </span>
                . Choose which images you would like to package into the ZIP download:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Option 1: Approved Only */}
                <button
                  type="button"
                  disabled={downloadingZipType !== null}
                  onClick={() => handleConfirmZipDownload(false)}
                  className="flex flex-col items-start p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40 text-left transition-all group cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Approved Only ({batchToDownloadZip.approved_images})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Downloads only fully verified and approved catalog images. Recommended for production.
                  </p>
                  <div className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 group-hover:underline flex items-center gap-1">
                    <Download className={`w-3.5 h-3.5 ${downloadingZipType === "approved" ? "animate-spin" : ""}`} />
                    <span>{downloadingZipType === "approved" ? "Preparing ZIP..." : "Download Approved"}</span>
                  </div>
                </button>

                {/* Option 2: All Images (Approved + Needs Review) */}
                <button
                  type="button"
                  disabled={downloadingZipType !== null}
                  onClick={() => handleConfirmZipDownload(true)}
                  className="flex flex-col items-start p-4 rounded-xl border border-sky-500/30 bg-sky-50/50 dark:bg-sky-950/20 hover:bg-sky-100/60 dark:hover:bg-sky-950/40 text-left transition-all group cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Download className="w-4 h-4 text-sky-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      All Images ({batchToDownloadZip.approved_images + batchToDownloadZip.review_needed_images})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Downloads all processed images including those marked for review, for inspection or offline editing.
                  </p>
                  <div className="mt-3 text-xs font-semibold text-sky-600 dark:text-sky-400 group-hover:underline flex items-center gap-1">
                    <Download className={`w-3.5 h-3.5 ${downloadingZipType === "all" ? "animate-spin" : ""}`} />
                    <span>{downloadingZipType === "all" ? "Preparing ZIP..." : "Download All"}</span>
                  </div>
                </button>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <ModalCancelButton onClick={() => setBatchToDownloadZip(null)}>
              Cancel
            </ModalCancelButton>
          </ModalFooter>
        </Modal>
      )}

      {/* CUSTOM CONFIRM DELETE MODAL */}
      {batchToDelete && (
        <ConfirmDialog
          title={`Permanently delete batch "${batchToDelete.batch_code}"?`}
          message={
            <span>
              This will remove all uploaded images, processed files, and database records.
              <span className="block mt-1 text-rose-500 font-medium">This action cannot be undone.</span>
            </span>
          }
          confirmLabel="Delete Batch"
          busyLabel="Deleting..."
          danger={true}
          onConfirm={confirmDeleteBatch}
          onCancel={() => setBatchToDelete(null)}
        />
      )}
    </PageContainer>
  );
}

// ── Batch Table Row Component with Expansion ───────────────────────────────────

function BatchTableRow({
  index,
  batch,
  isExpanded,
  progressPct,
  actionLoading,
  onToggle,
  onStart,
  onPause,
  onResume,
  onCancel,
  onDelete,
  images,
  imagesLoading,
  onReloadImages,
  retryingImageId,
  retryingBatchId,
  onRetryImage,
  onRetryBatchFailed,
  onDownloadZip,
}: {
  index: number;
  batch: BatchItem;
  isExpanded: boolean;
  progressPct: number;
  actionLoading: boolean;
  onToggle: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onDelete: () => void;
  images: ImageItem[];
  imagesLoading: boolean;
  onReloadImages: (status: string, search: string) => void;
  retryingImageId: number | null;
  retryingBatchId: number | null;
  onRetryImage: (imageId: number) => void;
  onRetryBatchFailed: () => void;
  onDownloadZip: () => void;
}) {
  const navigate = useNavigate();
  const [subSearch, setSubSearch] = useState("");
  const [subStatus, setSubStatus] = useState("");

  // Sub-table images pagination state
  const [imgPage, setImgPage] = useState(1);
  const [imgPageSize, setImgPageSize] = useState(10);

  const totalImgPages = Math.max(1, Math.ceil(images.length / imgPageSize));

  useEffect(() => {
    setImgPage(1);
  }, [subSearch, subStatus, batch.id]);

  useEffect(() => {
    setImgPage((p) => Math.min(Math.max(1, p), totalImgPages));
  }, [totalImgPages]);

  const pagedImages = useMemo(() => {
    return images.slice((imgPage - 1) * imgPageSize, imgPage * imgPageSize);
  }, [images, imgPage, imgPageSize]);

  const formattedDate = useMemo(() => {
    try {
      return new Date(batch.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return batch.created_at;
    }
  }, [batch.created_at]);

  return (
    <>
      <tr
        onClick={onToggle}
        className={`group transition-colors cursor-pointer select-none ${isExpanded
          ? "bg-sky-500/5 dark:bg-white/[0.04]"
          : "hover:bg-slate-50/80 dark:hover:bg-white/[0.02]"
          }`}
      >
        {/* # */}
        <td className="py-3.5 px-3 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
          {index + 1}
        </td>

        {/* Expansion Chevron */}
        <td className="py-3.5 px-2 text-center">
          <button
            type="button"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-transform"
            aria-label="Toggle batch images"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-sky-500" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </td>

        {/* Batch Code & Title */}
        <td className="py-3.5 px-4">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
              {batch.batch_code}
            </span>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">
              {batch.source_type || "upload"}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-xs mt-0.5" title={batch.name}>
            {batch.name}
          </p>
        </td>

        {/* Pipeline Status */}
        <td className="py-3.5 px-4">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${batch.status === "completed"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : batch.status === "processing"
                ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 animate-pulse"
                : batch.status === "paused"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  : "bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20"
              }`}
          >
            {batch.status === "processing" && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
            )}
            {batch.status}
          </span>
        </td>

        {/* Progress Bar & Counts */}
        <td className="py-3.5 px-4">
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px] font-medium text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{progressPct}%</span>
              <span>
                {batch.status === "completed"
                  ? `${batch.total_images} / ${batch.total_images}`
                  : `${batch.processed_images} / ${batch.total_images}`}{" "}
                items
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-indigo-600 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </td>

        {/* Quality Breakdown Pills */}
        <td className="py-3.5 px-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              title="Approved Images"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              {batch.approved_images} Approved
            </span>
            {batch.review_needed_images > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                title="Images needing manual review"
              >
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                {batch.review_needed_images} Review
              </span>
            )}
            {batch.failed_images > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                title="Failed conversions"
              >
                <XCircle className="w-3 h-3 text-rose-500" />
                {batch.failed_images} Failed
              </span>
            )}
          </div>
        </td>

        {/* Date */}
        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
          {formattedDate}
        </td>

        {/* Row Actions */}
        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-1.5">
            {batch.status === "created" && (
              <button
                type="button"
                onClick={onStart}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_2px_10px_rgba(14,165,233,0.25)] transition-all cursor-pointer active:scale-95"
                title="Start automated processing"
              >
                <Play className="w-3.5 h-3.5" /> Start
              </button>
            )}

            {batch.status === "processing" && (
              <button
                type="button"
                onClick={onPause}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 transition-colors"
                title="Pause processing"
              >
                <Pause className="w-3.5 h-3.5" /> Pause
              </button>
            )}

            {batch.status === "paused" && (
              <button
                type="button"
                onClick={onResume}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_2px_10px_rgba(14,165,233,0.25)] transition-all cursor-pointer active:scale-95"
                title="Resume processing"
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </button>
            )}

            {["created", "processing", "paused"].includes(batch.status) && (
              <button
                type="button"
                onClick={onCancel}
                disabled={actionLoading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                title="Cancel batch processing"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}

            {/* Quick Export Downloads if completed */}
            {batch.status === "completed" && (
              <>
                <button
                  type="button"
                  onClick={onDownloadZip}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors cursor-pointer"
                  title="Download standardized images ZIP"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadBatchExcelFile(batch.batch_code)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors cursor-pointer"
                  title="Download audit report Excel"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Expand / Inspect Icon Button */}
            <button
              type="button"
              onClick={onToggle}
              className={`p-1.5 rounded-lg transition-colors ${isExpanded
                ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 hover:bg-sky-500/25"
                : "text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10"
                }`}
              title={isExpanded ? "Close images view" : "Inspect processed images"}
              aria-label={isExpanded ? "Close images view" : "Inspect processed images"}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>

            {/* Delete Batch */}
            <button
              type="button"
              onClick={onDelete}
              disabled={actionLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              title="Permanently delete batch"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>

      {/* EXPANDED IMAGES SUB-TABLE */}
      {isExpanded && (
        <tr className="bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200/80 dark:border-white/10">
          <td colSpan={8} className="p-4 sm:p-6">
            <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-white/10 space-y-4">
              {/* Sub-header & Image Search Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-sky-500" />
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Processed Images: Batch {batch.batch_code}
                  </h4>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    ({images.length} items loaded)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter SKU or filename..."
                      value={subSearch}
                      onChange={(e) => {
                        setSubSearch(e.target.value);
                        onReloadImages(subStatus, e.target.value);
                      }}
                      className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none"
                    />
                  </div>

                  <select
                    value={subStatus}
                    onChange={(e) => {
                      setSubStatus(e.target.value);
                      onReloadImages(e.target.value, subSearch);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none"
                  >
                    <option value="">All Statuses</option>
                    <option value="auto_approved">Auto Approved</option>
                    <option value="needs_review">Needs Review</option>
                    <option value="manually_approved">Manually Approved</option>
                    <option value="processing">Processing</option>
                    <option value="failed">Failed</option>
                  </select>

                  {images.some((i) => i.status === "needs_review" || i.status === "failed") && (
                    <button
                      type="button"
                      disabled={retryingBatchId === batch.id}
                      onClick={onRetryBatchFailed}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 transition-colors disabled:opacity-50"
                      title="Retry all Needs Review / Failed images with Photoroom AI"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${retryingBatchId === batch.id ? "animate-spin" : ""}`} />
                      <span>{retryingBatchId === batch.id ? "Retrying with Photoroom..." : "Retry Needs Review"}</span>
                    </button>
                  )}

                  {images.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetImg =
                          images.find((img) => img.status.includes("approved") || img.status === "needs_review") ||
                          images[0];
                        navigate("/image-studio/review-studio", { state: { imageId: targetImg.id } });
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_2px_10px_rgba(14,165,233,0.25)] hover:shadow-[0_4px_14px_rgba(14,165,233,0.35)] transition-all cursor-pointer active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Open in Review Studio</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-Table of Processed Images */}
              {imagesLoading ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Loading processed images...
                </div>
              ) : images.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200/60 dark:border-white/5">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/75 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200/60 dark:border-white/5">
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-16">Preview</th>
                        <th className="py-2.5 px-3">Product SKU</th>
                        <th className="py-2.5 px-3">Original Filename</th>
                        <th className="py-2.5 px-3">Angle / View</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Standardization Quality</th>
                        <th className="py-2.5 px-3">AI Confidence</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white/40 dark:bg-transparent">
                      {pagedImages.map((img, imgIdx) => (
                        <tr
                          key={img.id}
                          className="hover:bg-sky-500/5 dark:hover:bg-white/[0.02] transition-colors cursor-pointer group"
                          onClick={() =>
                            navigate("/image-studio/review-studio", { state: { imageId: img.id } })
                          }
                          title="Click to inspect in Review Studio"
                        >
                          {/* # */}
                          <td className="py-2 px-3 text-center text-xs font-medium text-slate-400 dark:text-slate-500 font-mono">
                            {(imgPage - 1) * imgPageSize + imgIdx + 1}
                          </td>

                          {/* Thumbnail */}
                          <td className="py-2 px-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 overflow-hidden flex items-center justify-center relative shadow-2xs shrink-0">
                              <img
                                src={getImageFileUrl(
                                   img.id,
                                   img.status.includes("approved") ? "final" : "original"
                                )}
                                alt={img.original_filename}
                                className="max-h-full max-w-full object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><text x='15' y='55' font-size='12' fill='%23999'>No Img</text></svg>";
                                }}
                              />
                            </div>
                          </td>

                          {/* SKU */}
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white">
                            {img.bbid}
                          </td>

                          {/* Filename */}
                          <td className="py-2 px-3 max-w-xs text-slate-600 dark:text-slate-300 font-medium" title={img.original_filename}>
                            <div className="truncate">{img.original_filename}</div>
                            {img.error_message && (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5 line-clamp-2" title={img.error_message}>
                                {img.error_message}
                              </div>
                            )}
                          </td>

                          {/* Angle */}
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                              {img.image_type} #{img.sequence_order}
                            </span>
                          </td>

                          {/* Category (Food vs Non-Food vs Kitchen Items) */}
                          <td className="py-2 px-3">
                            {(() => {
                              const valStatus = img.validation_status || img.validation_results;
                              const rawCat = (
                                (img as any).product_category ||
                                valStatus?.product_category ||
                                valStatus?.gemini_classification?.primary_category ||
                                valStatus?.five_point_audit?.category_compliance?.product_category ||
                                (valStatus?.category_exemptions?.fssai_exempt ? "NON_FOOD" : null) ||
                                "UNKNOWN"
                              ).toUpperCase();
                              const cat = rawCat.replace(/-/g, "_");

                              if (cat === "KITCHEN_ITEMS" || cat === "KITCHEN") {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 whitespace-nowrap">
                                    Kitchen Items
                                  </span>
                                );
                              }
                              if (cat === "NON_FOOD" || cat === "NONFOOD") {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25 whitespace-nowrap">
                                    Non-Food
                                  </span>
                                );
                              }
                              if (cat === "FOOD") {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 whitespace-nowrap">
                                    Food
                                  </span>
                                );
                              }
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 whitespace-nowrap">
                                  Unknown
                                </span>
                              );
                            })()}
                          </td>

                          {/* Resolution Specs */}
                          <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                            {img.final_output_path ? "2000×2000 · 150 DPI" : "Processing..."}
                          </td>

                          {/* Confidence */}
                          <td className="py-2 px-3">
                            {img.confidence_score !== null ? (
                              <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                                <div className="w-8 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${(img.confidence_score || 0) >= 0.95
                                      ? "bg-emerald-500"
                                      : "bg-amber-500"
                                      }`}
                                    style={{
                                      width: `${Math.round((img.confidence_score || 0) * 100)}%`,
                                    }}
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
                              <span className="text-slate-400 text-[10px]">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-2 px-3">
                            {img.status === "needs_review" || img.status === "failed" ? (
                              <button
                                type="button"
                                disabled={retryingImageId === img.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRetryImage(img.id);
                                }}
                                title="Click to retry background removal with Photoroom AI"
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105 ${img.status === "needs_review"
                                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
                                    : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25"
                                  }`}
                              >
                                <RotateCcw className={`w-2.5 h-2.5 ${retryingImageId === img.id ? "animate-spin" : ""}`} />
                                <span>{retryingImageId === img.id ? "Retrying..." : img.status.replace("_", " ")}</span>
                              </button>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${img.status.includes("approved")
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : img.status === "processing"
                                    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 animate-pulse"
                                    : "bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20"
                                  }`}
                              >
                                {img.status.replace("_", " ")}
                              </span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                to="/image-studio/review-studio"
                                state={{ imageId: img.id }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Studio</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {images.length > 0 && (
                    <TablePagination
                      page={imgPage}
                      pageSize={imgPageSize}
                      totalPages={totalImgPages}
                      totalItems={images.length}
                      onPageChange={setImgPage}
                      onPageSizeChange={setImgPageSize}
                    />
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No images found matching your filter criteria in this batch.
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Integrated Create Batch Modal ─────────────────────────────────────────────

function getClientImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function CreateBatchModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newBatch: BatchItem) => void;
}) {
  const [batchName, setBatchName] = useState("");
  const [mode, setMode] = useState<"files" | "zip">("files");
  const [productCategory, setProductCategory] = useState<"auto" | "food" | "non_food" | "kitchen_items">("auto");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [targetWidth, setTargetWidth] = useState<number>(1500);
  const [targetHeight, setTargetHeight] = useState<number>(1500);
  const [submitting, setSubmitting] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspectionModalOpen, setInspectionModalOpen] = useState(false);
  const [inspectionData, setInspectionData] = useState<InspectionResponse | null>(null);
  const [clientLowResCount, setClientLowResCount] = useState(0);

  // Set default batch name and resolution inputs on open
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      setBatchName(`Catalog Batch - ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
      setImageFiles([]);
      setZipFile(null);
      setTargetWidth(1500);
      setTargetHeight(1500);
      setClientLowResCount(0);
      setInspectionData(null);
      setInspectionModalOpen(false);
    }
  }, [isOpen]);

  async function recheckFiles(files: File[], reqW: number, reqH: number) {
    let lowRes = 0;
    for (const f of files) {
      try {
        const dim = await getClientImageDimensions(f);
        if (dim.width > 0 && dim.height > 0 && (dim.width < reqW || dim.height < reqH)) {
          lowRes++;
        }
      } catch { }
    }
    setClientLowResCount(lowRes);
  }

  async function handleFileSelection(files: File[]) {
    setImageFiles(files);
    await recheckFiles(files, targetWidth, targetHeight);
  }

  async function handleLaunchInspection() {
    if (!batchName.trim()) {
      return showError("Please enter a batch name");
    }
    if (mode === "files" && imageFiles.length === 0) {
      return showError("Please select at least one image file to upload");
    }
    if (mode === "zip" && !zipFile) {
      return showError("Please select a ZIP archive file to upload");
    }

    setInspecting(true);
    setInspectionModalOpen(true);
    try {
      let res: InspectionResponse;
      if (mode === "files") {
        res = await inspectImageFiles(imageFiles, targetWidth, targetHeight);
      } else {
        res = await inspectImagesZip(zipFile!, targetWidth, targetHeight);
      }
      setInspectionData(res);
    } catch (e: any) {
      showError(e.message || "Failed to inspect images");
      setInspectionModalOpen(false);
    } finally {
      setInspecting(false);
    }
  }

  async function handleConfirmAndUpload() {
    setSubmitting(true);
    try {
      // 1. Create batch
      const batch = await createBatch({
        name: batchName.trim(),
        source_type: mode === "zip" ? "zip_upload" : "auto_images",
        config: {
          canvas_width: 2000,
          canvas_height: 2000,
          dpi: 150,
          product_category: productCategory,
          fop_bop_padding: { top: 180, bottom: 180, left: 100, right: 100 },
          confidence_threshold: 1.0,
        },
      });

      // 2. Upload images
      if (mode === "files" && imageFiles.length > 0) {
        await uploadBatchImageFiles(batch.id, imageFiles);
      } else if (mode === "zip" && zipFile) {
        await uploadBatchImagesZip(batch.id, zipFile);
      }

      // 3. Start processing
      try {
        await startBatchProcessing(batch.id);
        batch.status = "processing";
      } catch { }

      showSuccess(`Batch ${batch.batch_code} launched into automation!`);
      onCreated(batch);
      setInspectionModalOpen(false);
      onClose();
    } catch (e: any) {
      showError(e.message || "Failed to create extraction batch");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
    <Modal
      onClose={onClose}
      title="Create Extraction Batch"
      subtitle="Upload catalog product photos for automated background removal, padding, and validation"
      icon={Sparkles}
      size="xl"
    >
      <ModalBody>
        <div className="space-y-4">
          {/* Batch Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Batch Title *
              </label>
              <span className="text-[10px] font-mono font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                Auto-assigned ID: IS-BATCH&lt;id&gt;
              </span>
            </div>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Catalog Batch - Nov 7"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Enter descriptive title. The extraction batch ID is automatically created as <span className="text-sky-400 font-mono font-medium">IS-BATCH-&lt;id&gt;</span> based on the database index.
            </p>
          </div>

          {/* Upload Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Upload Method
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("files")}
                className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${mode === "files"
                  ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 shadow-2xs ring-1 ring-sky-500/30"
                  : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
              >
                <ImageIcon className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">Direct Images</div>
                  <div className="text-[10px] text-slate-500">Select multiple JPG, PNG, WEBP</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("zip")}
                className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${mode === "zip"
                  ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 shadow-2xs ring-1 ring-sky-500/30"
                  : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
              >
                <FolderArchive className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">ZIP Archive</div>
                  <div className="text-[10px] text-slate-500">Upload single .zip with images</div>
                </div>
              </button>
            </div>
          </div>

          {/* Product Category Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Product Category Logic
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setProductCategory("auto")}
                className={`p-2.5 rounded-xl border text-left transition-all ${productCategory === "auto"
                    ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/30"
                    : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
              >
                <div className="font-semibold text-xs text-slate-900 dark:text-white">Auto-Detect</div>
                <div className="text-[10px] text-slate-500">Gemini AI classification</div>
              </button>
              <button
                type="button"
                onClick={() => setProductCategory("food")}
                className={`p-2.5 rounded-xl border text-left transition-all ${productCategory === "food"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30"
                    : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
              >
                <div className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">Food</div>
                <div className="text-[10px] text-slate-500">FSSAI & Nutrition rules</div>
              </button>
              <button
                type="button"
                onClick={() => setProductCategory("non_food")}
                className={`p-2.5 rounded-xl border text-left transition-all ${productCategory === "non_food"
                    ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/30"
                    : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
              >
                <div className="font-semibold text-xs text-purple-600 dark:text-purple-400">Non-Food</div>
                <div className="text-[10px] text-slate-500">Directions & Safety rules</div>
              </button>
              <button
                type="button"
                onClick={() => setProductCategory("kitchen_items")}
                className={`p-2.5 rounded-xl border text-left transition-all ${productCategory === "kitchen_items"
                    ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30"
                    : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
              >
                <div className="font-semibold text-xs text-amber-600 dark:text-amber-400">Kitchen Items</div>
                <div className="text-[10px] text-slate-500">Cookware, Glass & Metal</div>
              </button>
            </div>
          </div>

          {/* Dynamic Validation Resolution (Width x Height) */}
          <div className="p-3.5 rounded-xl border border-sky-500/20 bg-sky-500/5 dark:bg-white/[0.02] space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-sky-500" />
                <span>Validation Resolution Dimensions</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setTargetWidth(1500);
                  setTargetHeight(1500);
                  recheckFiles(imageFiles, 1500, 1500);
                }}
                className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer"
              >
                Reset Default (1500 × 1500 px)
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Specify the minimum required pixel dimensions for image validation (Default: 1500 × 1500 px).
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Min Width (px)
                </label>
                <input
                  type="number"
                  min={1}
                  value={targetWidth}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setTargetWidth(val);
                    recheckFiles(imageFiles, val, targetHeight);
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs font-semibold focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Min Height (px)
                </label>
                <input
                  type="number"
                  min={1}
                  value={targetHeight}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setTargetHeight(val);
                    recheckFiles(imageFiles, targetWidth, val);
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs font-semibold focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Dropzone */}
          {mode === "files" ? (
            <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center hover:border-sky-500 transition-colors bg-slate-50/50 dark:bg-slate-900/40">
              <Upload className="w-8 h-8 text-sky-500 mx-auto mb-2" />
              <label className="cursor-pointer text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                Choose Image Files (Select Multiple)
                <input
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    handleFileSelection(files);
                  }}
                />
              </label>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports PNG, JPG, JPEG, and WEBP files
              </p>
              {imageFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    Selected {imageFiles.length} image file(s) (
                    {(imageFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                  {clientLowResCount > 0 ? (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center justify-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {clientLowResCount} image(s) below {targetWidth}×{targetHeight}px threshold (details in inspection report)
                    </div>
                  ) : (
                    <div className="text-[11px] text-sky-600 dark:text-sky-400 font-medium flex items-center justify-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      All selected images meet required quality
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center hover:border-sky-500 transition-colors bg-slate-50/50 dark:bg-slate-900/40">
              <FolderArchive className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
              <label className="cursor-pointer text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                Choose ZIP Archive (.zip)
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setZipFile(file);
                  }}
                />
              </label>
              <p className="text-[11px] text-slate-400 mt-1">All image files in the archive will be extracted and inspected automatically</p>
              {zipFile && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  Selected: {zipFile.name} ({(zipFile.size / (1024 * 1024)).toFixed(1)} MB)
                </div>
              )}
            </div>
          )}

          {/* BigBasket SRS Specifications Strip */}
          <div className="p-3 rounded-xl bg-sky-500/5 dark:bg-white/[0.02] border border-sky-500/15 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Automation Preset:</span>
            <span>2000×2000px · 150 DPI · SRS Padded (180/100)</span>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <button
          type="button"
          onClick={handleLaunchInspection}
          disabled={inspecting || submitting || (mode === "files" ? imageFiles.length === 0 : !zipFile)}
          className={PRIMARY_BUTTON}
        >
          {inspecting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Inspecting Image Quality &amp; Claims...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              <span>Inspect &amp; Launch Batch</span>
            </>
          )}
        </button>
      </ModalFooter>
    </Modal>

    <ImageInspectionModal
      isOpen={inspectionModalOpen}
      onClose={() => setInspectionModalOpen(false)}
      onConfirm={handleConfirmAndUpload}
      inspectionData={inspectionData}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      isLoading={inspecting}
      isUploading={submitting}
      batchTitle={batchName}
    />
    </>
  );
}

// ── Studio Analytics & Reports Modal ───────────────────────────────────────────

function AnalyticsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchDashboardSummary()
        .then(setSummary)
        .catch(() => { })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal
      onClose={onClose}
      title="Image Studio Analytics & Reports"
      subtitle="System-wide quality compliance, auto-approval yield, and audit metrics"
      icon={BarChart3}
      size="xl"
    >
      <ModalBody>
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-xs">
            Loading analytics metrics...
          </div>
        ) : summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Auto-Approval Rate</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {summary.auto_approval_rate.toFixed(1)}%
                </p>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-white/10 mt-2 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, summary.auto_approval_rate)}%` }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Catalog Items</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {summary.total_images}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Across {summary.total_batches} batches</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Avg AI Latency</p>
                <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">
                  {summary.avg_processing_time_ms ? `${Math.round(summary.avg_processing_time_ms)}ms` : "—"}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Per image background removal</p>
              </div>
            </div>

            {/* Quality Summary Breakdown */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10 space-y-2">
              <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                Standardization Quality Breakdown
              </h5>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  {summary.auto_approved_images + summary.manually_approved_images} Approved
                </div>
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                  {summary.review_needed_images} Flagged
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold">
                  {summary.failed_images} Failed
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400 text-xs">
            No analytics data available yet.
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <ModalCancelButton onClick={onClose}>Close</ModalCancelButton>
      </ModalFooter>
    </Modal>
  );
}
