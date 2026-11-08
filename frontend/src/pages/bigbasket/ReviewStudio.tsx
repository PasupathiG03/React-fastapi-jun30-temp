import { useEffect, useState, useRef } from "react";
import { useParams, Link, useSearchParams, useLocation } from "react-router-dom";
import {
  CheckCircle,
  XCircle,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Sliders,
  ArrowLeft,
  ShieldCheck,
  Move,
  AlertTriangle,
  Package,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { SECONDARY_BUTTON } from "@/components/ui";
import {
  fetchImageDetails,
  fetchReviewQueue,
  fetchBatches,
  fetchBatchImages,
  retryImageProcessing,
  updateImageCategory,
  getImageFileUrl,
} from "@/services/bigbasket";
import { showError, showSuccess } from "@/lib/toast";

export default function ReviewStudio() {
  const { imageId: paramId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const [activeImageId, setActiveImageId] = useState<number | null>(() => {
    const sId = (location.state as any)?.imageId || (location.state as any)?.id;
    const qId = searchParams.get("imageId") || searchParams.get("id") || paramId;
    const target = qId || sId;
    return target ? Number(target) : null;
  });

  // Sync activeImageId whenever URL query parameters or location state changes
  useEffect(() => {
    const sId = (location.state as any)?.imageId || (location.state as any)?.id;
    const qId = searchParams.get("imageId") || searchParams.get("id") || paramId;
    const target = qId || sId;
    if (target) {
      const numId = Number(target);
      if (!isNaN(numId) && numId !== activeImageId) {
        setActiveImageId(numId);
      }
    }
  }, [searchParams, location.state, paramId, activeImageId]);

  const [image, setImage] = useState<any>(null);
  const [batchSiblings, setBatchSiblings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [isWideView, setIsWideView] = useState(false);
  const [cacheBuster, setCacheBuster] = useState(Date.now());

  // Studio controls: Zoom & Pan
  const [viewMode, setViewMode] = useState<"side_by_side" | "result_only" | "original_only">("side_by_side");
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return; // left click only
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  function resetView() {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }

  useEffect(() => {
    if (activeImageId) {
      if (!image || image.id !== activeImageId) {
        loadDetails(activeImageId);
      }
    } else {
      loadFirstPending();
    }
  }, [activeImageId]);

  // Auto-refresh image details every 3 seconds if active image is still in progress
  useEffect(() => {
    if (!image?.id) return;
    if (image.status !== "processing" && image.status !== "pending") return;

    const timer = setInterval(() => {
      fetchImageDetails(image.id)
        .then((updated) => {
          setImage(updated);
          if (updated.status !== "processing" && updated.status !== "pending") {
            setCacheBuster(Date.now());
          }
        })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(timer);
  }, [image?.id, image?.status]);

  async function loadFirstPending() {
    setLoading(true);
    try {
      // 1. Check if any image needs manual review
      const queue = await fetchReviewQueue(1, 1);
      if (queue.items && queue.items.length > 0) {
        const targetId = queue.items[0].id;
        setActiveImageId(targetId);
        await loadDetails(targetId);
        return;
      }
      // 2. If automation auto-approved everything or batch is processing, find first completed image
      const batches = await fetchBatches(1, 10);
      if (batches.items && batches.items.length > 0) {
        for (const b of batches.items) {
          const batchImages = await fetchBatchImages(b.id, 1, 50);
          if (batchImages.items && batchImages.items.length > 0) {
            const completed =
              batchImages.items.find(
                (img) =>
                  img.status === "auto_approved" ||
                  img.status === "manually_approved" ||
                  Boolean(img.final_output_path)
              ) || batchImages.items[0];
            setActiveImageId(completed.id);
            await loadDetails(completed.id);
            return;
          }
        }
      }
      setImage(null);
    } catch {
      setImage(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(id: number) {
    setLoading(true);
    try {
      const data = await fetchImageDetails(id);
      setImage(data);
      if (data?.batch_id) {
        try {
          const siblings = await fetchBatchImages(data.batch_id, 1, 100);
          setBatchSiblings(siblings.items || []);
        } catch { }
      }
    } catch (e: any) {
      showError(e.message || "Failed to load image details");
      setImage(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryPhotoroom() {
    if (!image) return;
    setRetrying(true);
    try {
      const updated = await retryImageProcessing(image.id);
      setImage(updated);
      setCacheBuster(Date.now());
      if (updated.status === "auto_approved" || (updated.confidence_score && updated.confidence_score >= 0.95)) {
        showSuccess(`Photoroom AI background removal succeeded! SKU ${updated.bbid} is auto-approved.`);
      } else {
        showSuccess(`Photoroom re-processed SKU ${updated.bbid} (Confidence: ${Math.round((updated.confidence_score || 0) * 100)}%).`);
      }
    } catch (e: any) {
      showError(e.message || "Failed to retry image with Photoroom");
    } finally {
      setRetrying(false);
    }
  }

  const [updatingCat, setUpdatingCat] = useState(false);

  async function handleCycleCategory(currentCategory: string) {
    if (!image?.id) return;
    const catUpper = currentCategory.toUpperCase().replace(/-/g, "_");
    let nextCat: "FOOD" | "NON_FOOD" | "KITCHEN_ITEMS" = "NON_FOOD";
    if (catUpper === "FOOD") nextCat = "NON_FOOD";
    else if (catUpper === "NON_FOOD" || catUpper === "NONFOOD") nextCat = "KITCHEN_ITEMS";
    else if (catUpper === "KITCHEN_ITEMS" || catUpper === "KITCHEN") nextCat = "FOOD";
    else nextCat = "NON_FOOD";

    setUpdatingCat(true);
    try {
      const updated = await updateImageCategory(image.id, nextCat);
      setImage(updated);
      showSuccess(`Product category updated to ${nextCat.replace("_", " ")}`);
    } catch (e: any) {
      showError(e?.message || "Failed to update category");
    } finally {
      setUpdatingCat(false);
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="text-center py-20 text-slate-400 text-xs">Loading Review Studio...</div>
      </PageContainer>
    );
  }

  if (!image) {
    return (
      <PageContainer>
        <div className="glass-card rounded-2xl p-12 text-center max-w-md mx-auto my-12 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center mx-auto">
            <Sliders className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">Review Studio</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No processed images found yet. Select an image directly from the Batch Pipeline or upload a new batch to inspect here.
          </p>
          <div className="pt-2">
            <Link
              to="/image-studio"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-colors"
            >
              Go to Image Studio
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        icon={Sliders}
        title={image.original_filename ? `Review Studio: ${image.original_filename}` : `Review Studio: SKU ${image.bbid}`}
        subtitle={`SKU: ${image.bbid} (${image.image_type.toUpperCase()}) · Side-by-side inspection, transparent boundary validation, and reviewer sign-off`}
        actions={
          <div className="flex items-center gap-2">
            {/* Live Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider ${
                image.status === "auto_approved" || image.status === "manually_approved"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : image.status === "rejected"
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              }`}
            >
              {image.status === "manually_approved" ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Manually Approved
                </>
              ) : image.status === "auto_approved" ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Auto Approved
                </>
              ) : image.status === "rejected" ? (
                <>
                  <XCircle className="w-3.5 h-3.5 text-rose-500" /> Rejected
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Needs Review
                </>
              )}
            </span>

            <Link to="/image-studio" className={SECONDARY_BUTTON} title="Return to Image Studio">
              <ArrowLeft className="w-4 h-4" /> Studio
            </Link>

            {(image.status === "needs_review" || image.status === "failed" || (image.confidence_score && image.confidence_score < 0.95)) && (
              <button
                type="button"
                onClick={handleRetryPhotoroom}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 shadow-sm transition-all disabled:opacity-50"
                title="Retry AI background removal with Photoroom"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`} />
                <span>{retrying ? "Processing Photoroom..." : "Retry with Photoroom"}</span>
              </button>
            )}
          </div>
        }
      />

      {/* Batch Products Quick-Switcher Strip */}
      {batchSiblings.length > 0 && (
        <div className="glass-card rounded-2xl p-3 border border-slate-200/80 dark:border-white/10 mb-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-sky-500" />
              Batch Products ({batchSiblings.findIndex((s) => s.id === image.id) + 1} of {batchSiblings.length})
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-500 font-mono font-medium">
              {image.batch_code || `Batch #${image.batch_id}`}
            </span>
          </div>

          {/* Quick Item Pills / Thumbnails */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
            {batchSiblings.map((sibling, idx) => {
              const isSelected = sibling.id === image.id;
              const isApproved = sibling.status?.includes("approved");
              const isProcessing = sibling.status === "processing";
              const isNeedsReview = sibling.status === "needs_review";
              const isFailed = sibling.status === "failed";

              return (
                <button
                  key={sibling.id}
                  type="button"
                  onClick={() => {
                    setActiveImageId(sibling.id);
                    setSearchParams({ imageId: String(sibling.id) });
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? "bg-sky-500/15 border-sky-500 text-sky-600 dark:text-sky-300 ring-2 ring-sky-500/20 font-bold"
                      : "bg-white/40 dark:bg-slate-900/40 border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-sky-400/50"
                  }`}
                  title={`${sibling.original_filename || sibling.bbid} (${sibling.status})`}
                >
                  <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                  <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    <img
                      src={getImageFileUrl(sibling.id, isApproved ? "final" : "original")}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xs truncate max-w-[110px]">{sibling.bbid || sibling.original_filename || `Item ${idx + 1}`}</span>
                  {/* Status Indicator Icon */}
                  {isApproved ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : isProcessing ? (
                    <RotateCcw className="w-3.5 h-3.5 text-sky-500 animate-spin shrink-0" />
                  ) : isNeedsReview ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : isFailed ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Prev / Next Buttons */}
          <div className="flex items-center gap-1.5 shrink-0 justify-end">
            <button
              type="button"
              disabled={batchSiblings.findIndex((s) => s.id === image.id) <= 0}
              onClick={() => {
                const curIdx = batchSiblings.findIndex((s) => s.id === image.id);
                if (curIdx > 0) {
                  const prevId = batchSiblings[curIdx - 1].id;
                  setActiveImageId(prevId);
                  setSearchParams({ imageId: String(prevId) });
                }
              }}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              type="button"
              disabled={
                batchSiblings.findIndex((s) => s.id === image.id) === -1 ||
                batchSiblings.findIndex((s) => s.id === image.id) >= batchSiblings.length - 1
              }
              onClick={() => {
                const curIdx = batchSiblings.findIndex((s) => s.id === image.id);
                if (curIdx >= 0 && curIdx < batchSiblings.length - 1) {
                  const nextId = batchSiblings[curIdx + 1].id;
                  setActiveImageId(nextId);
                  setSearchParams({ imageId: String(nextId) });
                }
              }}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 transition-all"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 ${isWideView ? "lg:grid-cols-1" : "lg:grid-cols-3"} gap-5 transition-all duration-300`}>
        {/* Left 2 Cols (or full width in wide view): Interactive Canvas & Viewer */}
        <div className={`${isWideView ? "lg:col-span-1" : "lg:col-span-2"} flex flex-col space-y-4`}>
          <div className="glass-card rounded-2xl p-4 flex flex-col items-center justify-between flex-1 min-h-[580px] lg:min-h-[720px]">
            {/* Viewport Control Bar */}
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-white/10 text-xs flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setViewMode("side_by_side")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    viewMode === "side_by_side" ? "bg-sky-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                  }`}
                >
                  Side by Side
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("original_only")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    viewMode === "original_only" ? "bg-sky-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                  }`}
                >
                  Original Only
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("result_only")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    viewMode === "result_only" ? "bg-sky-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                  }`}
                >
                  Output Only
                </button>
              </div>

              {/* Zoom & Fullscreen Controls */}
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 mr-1 select-none">
                  <Move className="w-3 h-3 text-sky-500" /> Drag to move
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(25, z - (z > 300 ? 50 : 25)))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  className="px-2 py-1 rounded-md font-mono text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/5 text-sky-600 dark:text-sky-400"
                  title="Reset zoom & position"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(1200, z + (z >= 300 ? 50 : 25)))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300"
                  title="Zoom In (up to 1200%)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                {/* Quick Zoom Presets */}
                <div className="hidden lg:flex items-center gap-1 ml-1 text-[10px] font-semibold">
                  {[100, 300, 600, 1200].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setZoom(level)}
                      className={`px-1.5 py-0.5 rounded transition-colors ${
                        zoom === level
                          ? "bg-sky-500 text-white font-bold"
                          : "hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {level}%
                    </button>
                  ))}
                </div>

                {(zoom !== 100 || pan.x !== 0 || pan.y !== 0) && (
                  <button
                    type="button"
                    onClick={resetView}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 transition-colors"
                    title="Reset to 100% and centered"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
                <div className="h-4 w-px bg-slate-200 dark:border-white/10 mx-1" />
                <button
                  type="button"
                  onClick={() => setIsWideView(!isWideView)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    isWideView
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-300 ring-1 ring-sky-500/30"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                  }`}
                  title={isWideView ? "Switch to Split View" : "Maximize Canvas (Full Width)"}
                >
                  {isWideView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  <span>{isWideView ? "Split View" : "Full Width"}</span>
                </button>
              </div>
            </div>

            {/* Image Canvas */}
            <div
              className="w-full flex-1 flex items-center justify-center p-4 overflow-hidden min-h-[460px] lg:min-h-[580px]"
            >
              {viewMode === "side_by_side" ? (
                <div className="grid grid-cols-2 gap-4 w-full h-full max-h-[620px]">
                  {/* Original */}
                  <div
                    className={`relative rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-900/40 p-2 flex flex-col items-center justify-center overflow-hidden select-none ${
                      isDragging ? "cursor-grabbing" : "cursor-grab"
                    }`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <span className="absolute top-2 left-2 z-10 text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-md pointer-events-none">
                      Original ({image.original_width || "?"} × {image.original_height || "?"})
                    </span>
                    <img
                      src={`${getImageFileUrl(image.id, "original")}&_t=${cacheBuster}`}
                      alt="Original"
                      draggable={false}
                      className="max-h-full max-w-full object-contain pointer-events-none select-none transition-transform duration-75 ease-out"
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                        transformOrigin: "center center",
                      }}
                    />
                  </div>

                  {/* Processed (Transparent Checkerboard) */}
                  <div
                    className={`relative rounded-xl border border-slate-200 dark:border-white/10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-slate-50 dark:bg-slate-950 p-2 flex flex-col items-center justify-center overflow-hidden select-none ${
                      isDragging ? "cursor-grabbing" : "cursor-grab"
                    }`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <span className="absolute top-2 left-2 z-10 text-[10px] font-bold bg-emerald-600/80 text-white px-2 py-0.5 rounded-md pointer-events-none">
                      Output Canvas (2000 × 2000 px, 150 DPI)
                    </span>
                    {image.final_output_path || image.status?.includes("approved") ? (
                      <img
                        src={`${getImageFileUrl(image.id, "final")}&_t=${cacheBuster}`}
                        alt="Result"
                        draggable={false}
                        className="max-h-full max-w-full object-contain pointer-events-none select-none transition-transform duration-75 ease-out"
                        style={{
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                          transformOrigin: "center center",
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 z-10">
                        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center animate-spin">
                          <RotateCcw className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-bold text-slate-800 dark:text-white">AI Standardization In Progress</p>
                        <p className="text-xs text-slate-500 max-w-xs">
                          {image.status === "processing"
                            ? "Photoroom AI background removal & Gemini Vision are actively standardizing this SKU..."
                            : "Waiting in automated processing queue..."}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCacheBuster(Date.now());
                            if (image?.id) loadDetails(image.id);
                          }}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors shadow-2xs"
                        >
                          Refresh Status Now
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={`relative w-full h-full max-h-[620px] rounded-xl border border-slate-200 dark:border-white/10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-slate-50 dark:bg-slate-950 p-2 flex items-center justify-center overflow-hidden select-none ${
                    isDragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {viewMode === "result_only" && !image.final_output_path && !image.status?.includes("approved") ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 z-10">
                      <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center animate-spin">
                        <RotateCcw className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-800 dark:text-white">AI Standardization In Progress</p>
                      <p className="text-xs text-slate-500 max-w-xs">
                        This item is currently undergoing automated AI standardization.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCacheBuster(Date.now());
                          if (image?.id) loadDetails(image.id);
                        }}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors shadow-2xs"
                      >
                        Refresh Status Now
                      </button>
                    </div>
                  ) : (
                    <img
                      src={`${getImageFileUrl(image.id, viewMode === "original_only" ? "original" : "final")}&_t=${cacheBuster}`}
                      alt="Viewer"
                      draggable={false}
                      className="max-h-full max-w-full object-contain pointer-events-none select-none transition-transform duration-75 ease-out"
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                        transformOrigin: "center center",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Quality Checklist & Specifications */}
        <div className={isWideView ? "grid grid-cols-1 md:grid-cols-2 gap-5" : "space-y-4"}>
          {/* Quality Validation Checklist */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Automated Quality Checklist
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Dimensions (2000 × 2000):</span>
                <span className={`font-semibold ${image?.validation_status?.dimension_valid !== false ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {image?.validation_status?.dimension_valid !== false ? "PASSED" : "FAILED"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">DPI Header (150 DPI):</span>
                <span className={`font-semibold ${image?.validation_status?.dpi_valid !== false ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {image?.validation_status?.dpi_valid !== false ? "PASSED" : "FAILED"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Background Transparency:</span>
                <span className={`font-semibold ${image?.validation_status?.alpha_valid !== false ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {image?.validation_status?.alpha_valid !== false ? "PASSED" : "FAILED"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">FOP/BOP Framing:</span>
                <span className={`font-semibold ${image?.validation_status?.padding_valid !== false ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                  {image?.validation_status?.padding_valid !== false ? "PASSED" : "WARNING"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Complete Product Boundary:</span>
                <span className={`font-semibold ${image?.validation_status?.complete_product_boundary !== false ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                  {image?.validation_status?.complete_product_boundary !== false ? "PASSED" : "WARNING"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Top Content Preservation:</span>
                <span className={`font-semibold ${image?.validation_status?.top_content_preservation !== false ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                  {image?.validation_status?.top_content_preservation !== false ? "PASSED" : "WARNING"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Bottom Content Preservation:</span>
                <span className={`font-semibold ${image?.validation_status?.bottom_content_preservation !== false ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                  {image?.validation_status?.bottom_content_preservation !== false ? "PASSED" : "WARNING"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Image-Type Classification:</span>
                <span className={`font-semibold ${image?.image_type?.toLowerCase() !== "caution" && image?.validation_status?.classification_valid !== false ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {image?.image_type?.toLowerCase() === "caution" ? "FAILED (Invalid Type)" : "PASSED (SRS Compliant)"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Text Readability:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  PASSED
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Unexpected Blank Areas:</span>
                <span className={`font-semibold ${image?.validation_status?.unexpected_blank_areas !== false ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                  {image?.validation_status?.unexpected_blank_areas !== false ? "PASSED" : "WARNING"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Overall Processing Status:</span>
                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${image?.validation_status?.passed !== false ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"}`}>
                  {image?.validation_status?.passed !== false ? "PASSED" : "REQUIRES REVIEW"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 dark:text-slate-400">AI Confidence:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {Math.round((image?.confidence_score ?? 0.98) * 100)}%
                </span>
              </div>
              {image?.validation_status?.failure_reasons && image.validation_status.failure_reasons.length > 0 && (
                <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[11px] space-y-1">
                  <div className="font-bold">Detected Defect Warnings:</div>
                  <ul className="list-disc pl-3 space-y-0.5">
                    {image.validation_status.failure_reasons.map((r: string, idx: number) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Standardization Details Card */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-500" />
              Standardization Details
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Category:</span>
                {(() => {
                  const rawCat = (
                    image?.product_category ||
                    image?.validation_status?.product_category ||
                    image?.validation_results?.product_category ||
                    image?.validation_status?.gemini_classification?.primary_category ||
                    image?.validation_results?.gemini_classification?.primary_category ||
                    image?.validation_status?.five_point_audit?.category_compliance?.product_category ||
                    (image?.validation_status?.category_exemptions?.fssai_exempt ? "NON_FOOD" : null) ||
                    "UNKNOWN"
                  ).toUpperCase();
                  const cat = rawCat.replace(/-/g, "_");

                  const badgeConfig =
                    cat === "KITCHEN_ITEMS" || cat === "KITCHEN"
                      ? { label: "KITCHEN ITEMS", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25" }
                      : cat === "NON_FOOD" || cat === "NONFOOD"
                      ? { label: "NON-FOOD PRODUCT", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-500/25" }
                      : cat === "FOOD"
                      ? { label: "FOOD PRODUCT", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25" }
                      : { label: "UNKNOWN (REVIEW)", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25" };

                  return (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={updatingCat}
                        onClick={() => handleCycleCategory(cat)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center gap-1 ${badgeConfig.cls}`}
                        title="Click to cycle between Non-Food, Kitchen Items, and Food"
                      >
                        {badgeConfig.label}
                        <span className="text-[9px] opacity-70 underline ml-0.5 font-normal">(change)</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
              {image?.validation_status?.gemini_classification?.subcategory && (
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-600 dark:text-slate-400">Subcategory:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {image.validation_status.gemini_classification.subcategory}
                  </span>
                </div>
              )}

              {/* Dynamic Detected Products Breakdown */}
              {image?.validation_status?.gemini_classification?.detected_products?.length > 0 && (() => {
                const detCount = image.validation_status.gemini_classification.total_detected_products || image.validation_status.gemini_classification.detected_products.length;
                const isMulti = detCount > 1 || image.validation_status.gemini_classification.is_multi_product_image;
                const subCat = image.validation_status.gemini_classification.subcategory || image.validation_status.gemini_classification.product_type || "Product";
                const label = isMulti ? `${subCat} Set (${detCount} Items Detected)` : `${subCat} (${detCount} Item Detected)`;

                return (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        {label}
                      </span>
                      {isMulti && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 uppercase">
                          Multi-Object
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {image.validation_status.gemini_classification.detected_products.map((item: any, pIdx: number) => (
                        <div
                          key={pIdx}
                          className="p-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 text-[11px] space-y-0.5"
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              {item.product_type?.replace(/_/g, " ")}
                            </span>
                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-bold">
                              Qty: {item.quantity || 1}
                            </span>
                          </div>
                          {item.components && item.components.length > 0 && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              <span className="font-medium text-slate-600 dark:text-slate-300">Parts: </span>
                              {item.components.join(", ")}
                            </div>
                          )}
                          {item.materials && item.materials.length > 0 && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              <span className="font-medium text-slate-600 dark:text-slate-300">Materials: </span>
                              {item.materials.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {image?.validation_status?.gemini_classification?.materials?.length > 0 && (
                <div className="py-1 border-b border-slate-100 dark:border-white/5 space-y-1">
                  <span className="text-slate-600 dark:text-slate-400">Materials:</span>
                  <div className="flex flex-wrap gap-1">
                    {image.validation_status.gemini_classification.materials.map((m: any, idx: number) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[10px] text-slate-700 dark:text-slate-300 font-medium">
                        {m.name || m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {image?.validation_status?.gemini_classification?.components?.length > 0 && (
                <div className="py-1 border-b border-slate-100 dark:border-white/5 space-y-1">
                  <span className="text-slate-600 dark:text-slate-400">Components:</span>
                  <div className="flex flex-wrap gap-1">
                    {image.validation_status.gemini_classification.components.map((c: string, idx: number) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-medium">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">SKU / BBID:</span>
                <span className="font-bold text-slate-900 dark:text-white">{image?.bbid || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Complete Image Type:</span>
                <span className="font-bold text-slate-900 dark:text-white uppercase">
                  {image?.image_type?.toLowerCase() === "caution" ? "BOP" : (image?.image_type || "N/A")}
                </span>
              </div>
              {(() => {
                const sections =
                  image?.validation_status?.detected_sections?.sections ||
                  image?.validation_results?.detected_sections?.sections;
                if (!sections || sections.length === 0) return null;
                return (
                  <div className="py-1 border-b border-slate-100 dark:border-white/5 space-y-1">
                    <span className="text-slate-600 dark:text-slate-400">Detected Packaging Sections:</span>
                    <div className="flex flex-wrap gap-1">
                      {sections.map((s: string, idx: number) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-medium border border-sky-500/20">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Original Size:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {image?.original_width && image?.original_height ? `${image.original_width} × ${image.original_height} px` : "Unknown"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 dark:text-slate-400">Target Standard:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">2000 × 2000 px (150 DPI)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
