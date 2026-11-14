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
  Move,
  AlertTriangle,
  Package,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import GlobalPageLoader, { GlobalInlineLoader } from "@/components/GlobalLoader";
import { SECONDARY_BUTTON } from "@/components/ui";
import {
  fetchImageDetails,
  fetchReviewQueue,
  fetchBatches,
  fetchBatchImages,
  retryImageProcessing,
  getImageFileUrl,
} from "@/services/bigbasket";
import { showError, showSuccess } from "@/lib/toast";
import {
  BgRemovalErrorBanner,
  DownloadOutputImageButton,
  RerunBgRemovalButton,
  RerunLocalModelButton,
} from "@/components/bigbasket/RerunBgRemovalControls";

export default function ReviewStudio() {
  const { imageId: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [activeImageId, setActiveImageId] = useState<number | null>(() => {
    const sId = (location.state as any)?.imageId || (location.state as any)?.id;
    const qId = searchParams.get("imageId") || searchParams.get("id") || paramId;
    const target = qId || sId;
    return target ? Number(target) : null;
  });

  const initializedRef = useRef(false);

  // Clean address bar so internal imageId query parameters are never exposed in the URL
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Sync activeImageId only on initial mount or route param change (never on internal switching)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      const sId = (location.state as any)?.imageId || (location.state as any)?.id;
      const qId = searchParams.get("imageId") || searchParams.get("id") || paramId;
      const target = qId || sId;
      if (target) {
        const numId = Number(target);
        if (!isNaN(numId)) {
          setActiveImageId(numId);
        }
      }
    }
  }, [paramId]);

  const [image, setImage] = useState<any>(null);
  const [batchSiblings, setBatchSiblings] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [isWideView, setIsWideView] = useState(false);
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null);
  // Pixel size of the image shown in the Original pane. For an auto-extracted crop that is the uploaded
  // back-of-pack image, not the crop, so it can't come from image.original_width/height.
  const [originalShownSize, setOriginalShownSize] = useState<{ w: number; h: number } | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState<Record<string, boolean>>({});

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
        .catch(() => { });
    }, 3000);

    return () => clearInterval(timer);
  }, [image?.id, image?.status]);

  async function loadFirstPending() {
    setInitialLoading(true);
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
      setInitialLoading(false);
    }
  }

  async function loadDetails(id: number) {
    if (!image) {
      setInitialLoading(true);
    } else {
      setIsSwitching(true);
    }
    try {
      const data = await fetchImageDetails(id);
      setImage(data);
      if (data?.batch_id) {
        fetchBatchImages(data.batch_id, 1, 100)
          .then((siblings) => {
            setBatchSiblings(siblings.items || []);
          })
          .catch(() => { });
      }
    } catch (e: any) {
      showError(e.message || "Failed to load image details");
    } finally {
      setInitialLoading(false);
      setIsSwitching(false);
    }
  }

  // Smoothly center the active thumbnail pill inside the strip. Scroll only the strip itself —
  // scrollIntoView would also scroll the page/layout ancestors and shift the whole screen.
  useEffect(() => {
    const pill = activeThumbnailRef.current;
    const strip = pill?.parentElement;
    if (!pill || !strip) return;
    const pillRect = pill.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const offset = pillRect.left - stripRect.left - (stripRect.width - pillRect.width) / 2;
    strip.scrollTo({ left: strip.scrollLeft + offset, behavior: "smooth" });
  }, [activeImageId, image?.id]);

  const [retryingLocal, setRetryingLocal] = useState(false);

  async function handleRetryPhotoroom() {
    if (!image) return;
    setRetrying(true);
    try {
      const updated = await retryImageProcessing(image.id, "photoroom");
      setImage(updated);
      setCacheBuster(Date.now());
      if (image.batch_id) {
        fetchBatchImages(image.batch_id, 1, 100)
          .then((siblings) => setBatchSiblings(siblings.items || []))
          .catch(() => {});
      }
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

  async function handleRetryLocal() {
    if (!image) return;
    setRetryingLocal(true);
    try {
      const updated = await retryImageProcessing(image.id, "rmbg2");
      setImage(updated);
      setCacheBuster(Date.now());
      if (image.batch_id) {
        fetchBatchImages(image.batch_id, 1, 100)
          .then((siblings) => setBatchSiblings(siblings.items || []))
          .catch(() => {});
      }
      if (updated.error_message) {
        showError(updated.error_message);
      } else if (updated.status === "auto_approved" || (updated.confidence_score && updated.confidence_score >= 0.95)) {
        showSuccess(`Local RMBG-2.0 background removal succeeded! SKU ${updated.bbid} is auto-approved.`);
      } else {
        showSuccess(`Local RMBG-2.0 re-processed SKU ${updated.bbid} (Confidence: ${Math.round((updated.confidence_score || 0) * 100)}%).`);
      }
    } catch (e: any) {
      showError(e.message || "Failed to run local RMBG-2.0 background removal");
    } finally {
      setRetryingLocal(false);
    }
  }

  const [downloadingSingle, setDownloadingSingle] = useState(false);

  async function handleDownloadIndividualImage() {
    if (!image) return;
    setDownloadingSingle(true);
    try {
      const url = `${getImageFileUrl(image.id, "final")}&_t=${cacheBuster}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch image file");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const cleanBbid = image.bbid || "image";
      const seq = image.sequence_order || 1;
      a.download = `${cleanBbid}_${seq}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      showError(e?.message || "Failed to download image");
    } finally {
      setDownloadingSingle(false);
    }
  }

  const currentActiveId = activeImageId || image?.id;
  const currentIdx = batchSiblings.findIndex((s) => s.id === currentActiveId);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < batchSiblings.length - 1;

  function handleGoPrev() {
    if (currentIdx > 0) {
      const prevId = batchSiblings[currentIdx - 1].id;
      setActiveImageId(prevId);
    }
  }

  function handleGoNext() {
    if (currentIdx >= 0 && currentIdx < batchSiblings.length - 1) {
      const nextId = batchSiblings[currentIdx + 1].id;
      setActiveImageId(nextId);
    }
  }

  // Keyboard navigation for Left/Right arrow keys
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        if (hasPrev) {
          e.preventDefault();
          handleGoPrev();
        }
      } else if (e.key === "ArrowRight") {
        if (hasNext) {
          e.preventDefault();
          handleGoNext();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasPrev, hasNext, currentIdx, batchSiblings]);

  if (initialLoading && !image) {
    return <GlobalPageLoader />;
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
      <div className="subtable-row-in space-y-4">
        <PageHeader
          icon={Sliders}
          title={image.original_filename ? `Review Studio: ${image.original_filename}` : `Review Studio: SKU ${image.bbid}`}
          subtitle={`SKU: ${image.bbid} (${image.image_type.toUpperCase()}) · Side-by-side inspection, transparent boundary validation, and reviewer sign-off`}
          actions={
            <div className="flex items-center gap-2">
              {/* Live Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider ${image.status === "auto_approved" || image.status === "manually_approved"
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
            </div>
          }
        />

        <BgRemovalErrorBanner
          errorMessage={
            image.error_message ||
            image.validation_status?.failure_reasons?.find(
              (r: string) => r.toLowerCase().includes("rmbg") || r.toLowerCase().includes("background removal")
            )
          }
          onRerun={handleRetryPhotoroom}
          loading={retrying}
        />

        {/* Batch Products Quick-Switcher Strip */}
        {(batchSiblings.length > 0 || image.batch_id) && (
          <div className="glass-card rounded-2xl p-3 border border-slate-200/80 dark:border-white/10 mb-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs min-h-[58px]">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-sky-500" />
                Batch Products {batchSiblings.length > 0 && `(${currentIdx >= 0 ? currentIdx + 1 : 1} of ${batchSiblings.length})`}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-500 font-mono font-medium">
                {image.batch_code || (image.batch_id ? `Batch #${image.batch_id}` : "")}
              </span>
              {isSwitching && <GlobalInlineLoader text="Loading..." className="text-[11px]" />}
            </div>

            {/* Quick Item Pills / Thumbnails */}
            {batchSiblings.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
                {batchSiblings.map((sibling, idx) => {
                  const isSelected = sibling.id === currentActiveId;
                  const isApproved = sibling.status?.includes("approved");
                  const isProcessing = sibling.status === "processing";
                  const isNeedsReview = sibling.status === "needs_review";
                  const isFailed = sibling.status === "failed";

                  return (
                    <button
                      key={sibling.id}
                      ref={isSelected ? activeThumbnailRef : null}
                      type="button"
                      onClick={() => {
                        setActiveImageId(sibling.id);
                      }}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-all shrink-0 cursor-pointer ${isSelected
                          ? "bg-sky-500/15 border-sky-500 text-sky-600 dark:text-sky-300 ring-2 ring-sky-500/20 font-bold shadow-xs"
                          : "bg-white/40 dark:bg-slate-900/40 border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-sky-400/50 hover:bg-slate-100/50 dark:hover:bg-white/5"
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
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin animate-pulse">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 w-28 rounded-xl bg-slate-200/70 dark:bg-white/5 shrink-0" />
                ))}
              </div>
            )}

            {/* Prev / Next Buttons */}
            <div className="flex items-center gap-1.5 shrink-0 justify-end">
              <button
                type="button"
                disabled={!hasPrev || batchSiblings.length === 0}
                onClick={handleGoPrev}
                className={`${SECONDARY_BUTTON} !px-3 !py-1.5 !gap-1 cursor-pointer disabled:!opacity-40 disabled:cursor-not-allowed`}
                title="Previous Image (Left Arrow)"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                type="button"
                disabled={!hasNext || batchSiblings.length === 0}
                onClick={handleGoNext}
                className={`${SECONDARY_BUTTON} !px-3 !py-1.5 !gap-1 cursor-pointer disabled:!opacity-40 disabled:cursor-not-allowed`}
                title="Next Image (Right Arrow)"
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${viewMode === "side_by_side" ? "bg-sky-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                    }`}
                >
                  Side by Side
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("original_only")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${viewMode === "original_only" ? "bg-sky-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                    }`}
                >
                  Original Only
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("result_only")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${viewMode === "result_only" ? "bg-sky-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
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

                <button
                  type="button"
                  onClick={resetView}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                  title="Reset to 100% and centered"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
                <div className="h-4 w-px bg-slate-200 dark:border-white/10 mx-1" />
                <button
                  type="button"
                  onClick={() => setIsWideView(!isWideView)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${isWideView
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
                    className={`relative rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-900/40 p-2 flex flex-col items-center justify-center overflow-hidden select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"
                      }`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <span className="absolute top-2 left-2 z-10 text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-md pointer-events-none">
                      Original ({originalShownSize?.w || image.original_width || "?"} × {originalShownSize?.h || image.original_height || "?"})
                    </span>
                    {!imagesLoaded[`${image.id}_orig`] && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-sky-500 animate-spin" />
                      </div>
                    )}
                    <img
                      src={`${getImageFileUrl(image.id, "original")}&_t=${cacheBuster}`}
                      alt="Original"
                      draggable={false}
                      onLoad={(e) => {
                        setOriginalShownSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
                        setImagesLoaded((prev) => ({ ...prev, [`${image.id}_orig`]: true }));
                      }}
                      className={`max-h-full max-w-full object-contain pointer-events-none select-none transition-all duration-200 ease-out ${
                        imagesLoaded[`${image.id}_orig`] ? "opacity-100" : "opacity-0"
                      }`}
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                        transformOrigin: "center center",
                      }}
                    />
                  </div>

                  {/* Processed (Transparent Checkerboard) */}
                  <div
                    className={`relative rounded-xl border border-slate-200 dark:border-white/10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-slate-50 dark:bg-slate-950 p-2 flex flex-col items-center justify-center overflow-hidden select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"
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
                      <>
                        {!imagesLoaded[`${image.id}_final`] && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-sky-500 animate-spin" />
                          </div>
                        )}
                        <img
                          src={`${getImageFileUrl(image.id, "final")}&_t=${cacheBuster}`}
                          alt="Result"
                          draggable={false}
                          onLoad={() => {
                            setImagesLoaded((prev) => ({ ...prev, [`${image.id}_final`]: true }));
                          }}
                          className={`max-h-full max-w-full object-contain pointer-events-none select-none transition-all duration-200 ease-out ${
                            imagesLoaded[`${image.id}_final`] ? "opacity-100" : "opacity-0"
                          }`}
                          style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                            transformOrigin: "center center",
                          }}
                        />
                      </>
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
                  className={`relative w-full h-full max-h-[620px] rounded-xl border border-slate-200 dark:border-white/10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-slate-50 dark:bg-slate-950 p-2 flex items-center justify-center overflow-hidden select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"
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
                    <>
                      {!imagesLoaded[`${image.id}_single`] && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-sky-500 animate-spin" />
                        </div>
                      )}
                      <img
                        src={`${getImageFileUrl(image.id, viewMode === "original_only" ? "original" : "final")}&_t=${cacheBuster}`}
                        alt="Viewer"
                        draggable={false}
                        onLoad={() => {
                          setImagesLoaded((prev) => ({ ...prev, [`${image.id}_single`]: true }));
                        }}
                        className={`max-h-full max-w-full object-contain pointer-events-none select-none transition-all duration-200 ease-out ${
                          imagesLoaded[`${image.id}_single`] ? "opacity-100" : "opacity-0"
                        }`}
                        style={{
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                          transformOrigin: "center center",
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Quality Checklist & Specifications */}
        <div className={isWideView ? "space-y-4" : "space-y-4"}>
          {/* Quality Validation Checklist */}
          {/* Quality Validation Checklist (Strict 6 BigBasket SRS Categories) */}
          {/* Hidden for now — Automated Quality Checklist card. Uncomment to restore.
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Automated Quality Checklist
              </h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                6 Checks
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              {(() => {
                const check1Passed = image?.validation_status?.dimension_valid !== false && image?.validation_status?.dpi_valid !== false;
                const check2Passed = image?.validation_status?.alpha_valid !== false;
                const check3Passed = image?.validation_status?.padding_valid !== false;
                const check4Passed = image?.image_type?.toLowerCase() !== "caution" && image?.validation_status?.classification_valid !== false;
                const check5Passed = (
                  image?.validation_status?.complete_product_boundary !== false &&
                  image?.validation_status?.top_content_preservation !== false &&
                  image?.validation_status?.bottom_content_preservation !== false &&
                  image?.validation_status?.unexpected_blank_areas !== false
                );
                const check6Passed = image?.validation_status?.passed !== false && !image?.status?.includes("failed");

                const srsChecks = [
                  {
                    num: "01",
                    title: "Image Dimensions & DPI",
                    desc: "2000 × 2000 · PNG · 150 DPI · RGB",
                    passed: check1Passed,
                  },
                  {
                    num: "02",
                    title: "Background Transparency",
                    desc: "Background and internal-hole validation",
                    passed: check2Passed,
                  },
                  {
                    num: "03",
                    title: "Cropping & Padding",
                    desc: "FOP/BOP margins or edge-to-edge coverage",
                    passed: check3Passed,
                  },
                  {
                    num: "04",
                    title: "Image Classification",
                    desc: "FOP · BOP · Ingredient · Nutrition · Others",
                    passed: check4Passed,
                  },
                  {
                    num: "05",
                    title: "Content Completeness & Quality",
                    desc: "Complete boundaries, text and image quality",
                    passed: check5Passed,
                  },
                  {
                    num: "06",
                    title: "Processing Status & Exceptions",
                    desc: "Success · Failed · Manual Review",
                    passed: check6Passed,
                  },
                ];

                return (
                  <>
                    {srsChecks.map((c) => (
                      <div key={c.num} className="flex items-center justify-between gap-3 py-1">
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[11px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {c.num}
                          </span>
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                              {c.title}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                              {c.desc}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {c.passed ? (
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">AI Confidence:</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                        {Math.round((image?.confidence_score ?? 1.0) * 100)}%
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
                  </>
                );
              })()}
            </div>
          </div>
          */}

          {/* Standardization Details Card (Option 1: Compact 2-Column Grid) */}
          <div className="glass-card rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-500" />
                Standardization Details
              </h3>
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
                    ? { label: "KITCHEN ITEMS", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" }
                    : cat === "NON_FOOD" || cat === "NONFOOD"
                      ? { label: "NON-FOOD", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30" }
                      : cat === "FOOD"
                        ? { label: "FOOD", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" }
                        : { label: "UNKNOWN", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30" };

                return (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider inline-flex items-center ${badgeConfig.cls}`}
                  >
                    {badgeConfig.label}
                  </span>
                );
              })()}
            </div>

            {/* 2-Column Compact Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">SKU / BBID</span>
                <p className="font-bold text-slate-900 dark:text-white truncate">{image?.bbid || "N/A"}</p>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Image Type</span>
                <p className="font-bold text-slate-900 dark:text-white uppercase truncate">
                  {image?.image_type?.toLowerCase() === "caution" ? "BOP" : (image?.image_type || "N/A")}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Original Size</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {image?.original_width && image?.original_height ? `${image.original_width} × ${image.original_height}` : "Unknown"}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Target Standard</span>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400 truncate">2000 × 2000 (150 DPI)</p>
              </div>
            </div>

            {/* Subcategory if present */}
            {image?.validation_status?.gemini_classification?.subcategory && (
              <div className="flex items-center justify-between text-xs py-1 border-t border-slate-100 dark:border-white/5">
                <span className="text-slate-500">Subcategory:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {image.validation_status.gemini_classification.subcategory}
                </span>
              </div>
            )}

            {/* Dynamic Detected Products Breakdown (Compact Scroll) */}
            {image?.validation_status?.gemini_classification?.detected_products?.length > 0 && (() => {
              const detCount = image.validation_status.gemini_classification.total_detected_products || image.validation_status.gemini_classification.detected_products.length;
              const isMulti = detCount > 1 || image.validation_status.gemini_classification.is_multi_product_image;
              const subCat = image.validation_status.gemini_classification.subcategory || image.validation_status.gemini_classification.product_type || "Product";
              const label = isMulti ? `${subCat} Set (${detCount} Items)` : `${subCat} (${detCount} Item)`;

              return (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      {label}
                    </span>
                    {isMulti && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 uppercase">
                        Multi-Object
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto pr-1 scrollbar-thin">
                    {image.validation_status.gemini_classification.detected_products.map((item: any, pIdx: number) => (
                      <div
                        key={pIdx}
                        className="p-1.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 text-[10px] space-y-0.5"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {item.product_type?.replace(/_/g, " ")}
                          </span>
                          <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-bold">
                            Qty: {item.quantity || 1}
                          </span>
                        </div>
                        {item.components && item.components.length > 0 && (
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                            <span className="font-medium text-slate-600 dark:text-slate-300">Parts: </span>
                            {item.components.join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Materials & Components compact tags */}
            {(image?.validation_status?.gemini_classification?.materials?.length > 0 || image?.validation_status?.gemini_classification?.components?.length > 0) && (
              <div className="pt-2 pb-1 border-t border-slate-100 dark:border-white/5 space-y-1.5 text-[11px]">
                {image?.validation_status?.gemini_classification?.materials?.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-400 text-[10px] font-semibold">Materials:</span>
                    {image.validation_status.gemini_classification.materials.map((m: any, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-[10px] text-slate-700 dark:text-slate-300 font-medium">
                        {m.name || m}
                      </span>
                    ))}
                  </div>
                )}
                {image?.validation_status?.gemini_classification?.components?.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-400 text-[10px] font-semibold">Components:</span>
                    {image.validation_status.gemini_classification.components.map((c: string, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-medium">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Background Removal Reprocessing & Download Actions */}
            <div className="pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <RerunLocalModelButton
                  onClick={handleRetryLocal}
                  loading={retryingLocal}
                  disabled={retrying || downloadingSingle}
                  className="w-full"
                />
                <RerunBgRemovalButton
                  onClick={handleRetryPhotoroom}
                  loading={retrying}
                  disabled={retryingLocal || downloadingSingle}
                  className="w-full"
                />
              </div>
              <DownloadOutputImageButton
                onClick={handleDownloadIndividualImage}
                loading={downloadingSingle}
                disabled={retrying || retryingLocal || (!image?.final_output_path && !image?.status?.includes("approved"))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
      </div>
    </PageContainer>
  );
}
