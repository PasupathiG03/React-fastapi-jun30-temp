import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link, useSearchParams, useLocation } from "react-router-dom";
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
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
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

export default function ReviewStudio() {
  const { imageId: paramId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const stateId = (location.state as any)?.imageId || (location.state as any)?.id;
  const initialTargetId = stateId || searchParams.get("id") || searchParams.get("imageId") || paramId;

  const [activeImageId, setActiveImageId] = useState<number | null>(
    initialTargetId ? Number(initialTargetId) : null
  );

  // Clean raw IDs from URL bar immediately if user landed via param or query string
  useEffect(() => {
    if (paramId) {
      navigate("/image-studio/review-studio", { replace: true, state: { imageId: Number(paramId) } });
    } else if (searchParams.has("id") || searchParams.has("imageId")) {
      setSearchParams({}, { replace: true });
    }
  }, [paramId, searchParams, setSearchParams, navigate]);

  const [image, setImage] = useState<any>(null);
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

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? (zoom >= 300 ? 50 : 25) : (zoom > 300 ? -50 : -25);
    setZoom((z) => Math.max(25, Math.min(1200, z + delta)));
  }

  useEffect(() => {
    if (activeImageId) {
      loadDetails(activeImageId);
    } else {
      loadFirstPending();
    }
  }, [activeImageId]);

  async function loadFirstPending() {
    try {
      // 1. Check if any image needs review
      const queue = await fetchReviewQueue(1, 1);
      if (queue.items && queue.items.length > 0) {
        setActiveImageId(queue.items[0].id);
        return;
      }
      // 2. If automation auto-approved everything, load latest processed image from the latest batch
      const batches = await fetchBatches(1, 1);
      if (batches.items && batches.items.length > 0) {
        const batchImages = await fetchBatchImages(batches.items[0].id, 1, 1);
        if (batchImages.items && batchImages.items.length > 0) {
          setActiveImageId(batchImages.items[0].id);
          return;
        }
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  async function loadDetails(id: number) {
    try {
      const data = await fetchImageDetails(id);
      setImage(data);
    } catch (e: any) {
      showError(e.message || "Failed to load image details");
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
                  <Move className="w-3 h-3 text-sky-500" /> Drag to move · Scroll to zoom
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

            {/* Image Canvas with Wheel Zoom */}
            <div
              className="w-full flex-1 flex items-center justify-center p-4 overflow-hidden min-h-[460px] lg:min-h-[580px]"
              onWheel={handleWheel}
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
                <span className="text-slate-600 dark:text-slate-400">Transparent Background:</span>
                <span className={`font-semibold ${image?.validation_status?.alpha_valid !== false ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {image?.validation_status?.alpha_valid !== false ? "PASSED" : "FAILED"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Framing (Table 3 Margins):</span>
                <span className={`font-semibold ${image?.validation_status?.padding_valid !== false ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                  {image?.validation_status?.padding_valid !== false ? "PASSED" : "WARNING"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 dark:text-slate-400">AI Confidence:</span>
                <span className="font-bold text-slate-900 dark:text-white">
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
                <span className="text-slate-600 dark:text-slate-400">SKU / BBID:</span>
                <span className="font-bold text-slate-900 dark:text-white">{image?.bbid || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Image Type:</span>
                <span className="font-bold text-slate-900 dark:text-white uppercase">{image?.image_type || "N/A"}</span>
              </div>
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
