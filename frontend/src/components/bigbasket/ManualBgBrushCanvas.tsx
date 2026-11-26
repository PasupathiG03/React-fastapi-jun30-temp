import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { getImageFileUrl } from "@/services/bigbasket";

export type BrushMode = "erase" | "restore" | "pan";

export interface ManualBgBrushCanvasHandle {
  undo: () => void;
  redo: () => void;
  resetMask: () => void;
  exportMaskBlob: () => Promise<Blob | null>;
}

interface ManualBgBrushCanvasProps {
  imageId: number;
  cacheBuster: number;
  mode: BrushMode;
  brushSize: number;
  brushSoftness: number;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
  onHistoryChange: (state: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  }) => void;
}

const MAX_HISTORY = 50;

function createHatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = 16;
  tile.height = 16;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;
  tctx.fillStyle = "rgba(37, 99, 235, 0.34)";
  tctx.fillRect(0, 0, 16, 16);
  tctx.strokeStyle = "rgba(96, 165, 250, 0.68)";
  tctx.lineWidth = 2;
  tctx.beginPath();
  tctx.moveTo(-4, 16);
  tctx.lineTo(16, -4);
  tctx.moveTo(0, 20);
  tctx.lineTo(20, 0);
  tctx.stroke();
  return ctx.createPattern(tile, "repeat");
}

async function fetchImageElement(url: string): Promise<HTMLImageElement> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objUrl);
      reject(err);
    };
    img.src = objUrl;
  });
}

export const ManualBgBrushCanvas = forwardRef<ManualBgBrushCanvasHandle, ManualBgBrushCanvasProps>(
  (
    {
      imageId,
      cacheBuster,
      mode,
      brushSize,
      brushSoftness,
      zoom,
      pan,
      onPanChange,
      onHistoryChange,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const initialMaskRef = useRef<ImageData | null>(null);
    const hatchPatternRef = useRef<CanvasPattern | null>(null);

    const undoStackRef = useRef<ImageData[]>([]);
    const redoStackRef = useRef<ImageData[]>([]);

    const [loading, setLoading] = useState(true);
    const [imgDims, setImgDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [isPainting, setIsPainting] = useState(false);
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const lastPtRef = useRef<{ x: number; y: number } | null>(null);
    const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
      x: 0,
      y: 0,
      panX: 0,
      panY: 0,
    });

    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [displayScale, setDisplayScale] = useState(1);
    const [showCenterPreview, setShowCenterPreview] = useState(false);
    const prevBrushSizeRef = useRef(brushSize);

    const emitHistory = useCallback(() => {
      onHistoryChange({
        canUndo: undoStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0,
        undoCount: undoStackRef.current.length,
        redoCount: redoStackRef.current.length,
      });
    }, [onHistoryChange]);

    const renderDisplay = useCallback(() => {
      const display = displayCanvasRef.current;
      const orig = origCanvasRef.current;
      const mask = maskCanvasRef.current;
      if (!display || !orig || !mask) return;
      const ctx = display.getContext("2d");
      if (!ctx) return;

      const w = display.width;
      const h = display.height;
      ctx.clearRect(0, 0, w, h);

      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(orig, 0, 0, w, h);

      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, w, h);

      if (!hatchPatternRef.current) {
        hatchPatternRef.current = createHatchPattern(ctx);
      }
      if (hatchPatternRef.current) {
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = hatchPatternRef.current;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = "source-over";
    }, []);

    // Load final output image (fallback to original) to initialize canvases directly on the output
    useEffect(() => {
      let cancelled = false;
      setLoading(true);
      undoStackRef.current = [];
      redoStackRef.current = [];
      emitHistory();

      async function init() {
        try {
          const finalUrl = `${getImageFileUrl(imageId, "final")}&_t=${cacheBuster}`;
          const origUrl = `${getImageFileUrl(imageId, "original")}&_t=${cacheBuster}`;

          const [finalImg, origImg] = await Promise.all([
            fetchImageElement(finalUrl).catch(() => null),
            fetchImageElement(origUrl).catch(() => null),
          ]);
          const baseImg = finalImg || origImg;
          if (!baseImg || cancelled) return;

          const w = baseImg.naturalWidth;
          const h = baseImg.naturalHeight;

          const origCanvas = document.createElement("canvas");
          origCanvas.width = w;
          origCanvas.height = h;
          const octx = origCanvas.getContext("2d", { willReadFrequently: true });

          const maskCanvas = document.createElement("canvas");
          maskCanvas.width = w;
          maskCanvas.height = h;
          const mctx = maskCanvas.getContext("2d", { willReadFrequently: true });

          if (octx && mctx) {
            // 1. Extract initial alpha mask from baseImg (final output if available)
            octx.drawImage(baseImg, 0, 0, w, h);
            const baseData = octx.getImageData(0, 0, w, h);
            const maskData = mctx.createImageData(w, h);
            const src = baseData.data;
            const dst = maskData.data;
            for (let i = 0; i < src.length; i += 4) {
              dst[i] = 255;
              dst[i + 1] = 255;
              dst[i + 2] = 255;
              dst[i + 3] = src[i + 3];
            }
            mctx.putImageData(maskData, 0, 0);
            initialMaskRef.current = mctx.getImageData(0, 0, w, h);

            // 2. Backfill origCanvas with the original image underneath baseImg so Brush (Add)
            //    can restore pixels even in areas that were already transparent in final.
            if (finalImg && origImg) {
              octx.clearRect(0, 0, w, h);
              const scale = Math.min((w - 20) / origImg.naturalWidth, (h - 20) / origImg.naturalHeight);
              const fitW = Math.round(origImg.naturalWidth * scale);
              const fitH = Math.round(origImg.naturalHeight * scale);
              const ox = Math.floor((w - fitW) / 2);
              const oy = Math.floor((h - fitH) / 2);
              octx.drawImage(origImg, ox, oy, fitW, fitH);
              octx.drawImage(finalImg, 0, 0, w, h);
            }
          }
          origCanvasRef.current = origCanvas;
          maskCanvasRef.current = maskCanvas;

          setImgDims({ w, h });
          setLoading(false);
        } catch {
          if (!cancelled) setLoading(false);
        }
      }

      init();
      return () => {
        cancelled = true;
      };
    }, [imageId, cacheBuster, emitHistory]);

    // Sync display canvas dimensions & render once loaded or overlay toggled
    useEffect(() => {
      if (!loading && imgDims.w > 0 && displayCanvasRef.current) {
        displayCanvasRef.current.width = imgDims.w;
        displayCanvasRef.current.height = imgDims.h;
        hatchPatternRef.current = null;
        renderDisplay();
      }
    }, [loading, imgDims, renderDisplay]);

    // Keep displayScale synced with zoom/pan/resize so [ / ] and slider updates resize the cursor immediately
    useEffect(() => {
      if (loading || imgDims.w === 0) return;
      const syncScale = () => {
        const canvas = displayCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
          setDisplayScale(rect.width / imgDims.w);
        }
      };
      syncScale();
      window.addEventListener("resize", syncScale);
      return () => window.removeEventListener("resize", syncScale);
    }, [loading, imgDims.w, zoom, pan]);

    // Show a temporary centered real-size preview when adjusting brushSize from the sidebar slider
    useEffect(() => {
      if (prevBrushSizeRef.current === brushSize) return;
      prevBrushSizeRef.current = brushSize;
      if (loading || cursorPos !== null) return;
      setShowCenterPreview(true);
      const timer = window.setTimeout(() => setShowCenterPreview(false), 1200);
      return () => window.clearTimeout(timer);
    }, [brushSize, loading, cursorPos]);

    // Space key for temporary pan while in brush mode
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") return;
          e.preventDefault();
          if (!e.repeat) {
            setSpaceHeld(true);
          }
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag !== "INPUT" && tag !== "TEXTAREA") {
            e.preventDefault();
          }
          setSpaceHeld(false);
        }
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    }, []);

    const pushUndoSnapshot = useCallback(() => {
      const mask = maskCanvasRef.current;
      if (!mask) return;
      const mctx = mask.getContext("2d");
      if (!mctx) return;
      const snap = mctx.getImageData(0, 0, mask.width, mask.height);
      undoStackRef.current = [...undoStackRef.current.slice(-(MAX_HISTORY - 1)), snap];
      redoStackRef.current = [];
      emitHistory();
    }, [emitHistory]);

    const undo = useCallback(() => {
      const mask = maskCanvasRef.current;
      if (!mask || undoStackRef.current.length === 0) return;
      const mctx = mask.getContext("2d");
      if (!mctx) return;
      const current = mctx.getImageData(0, 0, mask.width, mask.height);
      const prev = undoStackRef.current[undoStackRef.current.length - 1];
      undoStackRef.current = undoStackRef.current.slice(0, -1);
      redoStackRef.current = [...redoStackRef.current, current];
      mctx.putImageData(prev, 0, 0);
      emitHistory();
      renderDisplay();
    }, [emitHistory, renderDisplay]);

    const redo = useCallback(() => {
      const mask = maskCanvasRef.current;
      if (!mask || redoStackRef.current.length === 0) return;
      const mctx = mask.getContext("2d");
      if (!mctx) return;
      const current = mctx.getImageData(0, 0, mask.width, mask.height);
      const next = redoStackRef.current[redoStackRef.current.length - 1];
      redoStackRef.current = redoStackRef.current.slice(0, -1);
      undoStackRef.current = [...undoStackRef.current, current];
      mctx.putImageData(next, 0, 0);
      emitHistory();
      renderDisplay();
    }, [emitHistory, renderDisplay]);

    const resetMask = useCallback(() => {
      const mask = maskCanvasRef.current;
      const initial = initialMaskRef.current;
      if (!mask || !initial) return;
      const mctx = mask.getContext("2d");
      if (!mctx) return;
      pushUndoSnapshot();
      mctx.putImageData(initial, 0, 0);
      renderDisplay();
    }, [pushUndoSnapshot, renderDisplay]);

    const exportMaskBlob = useCallback(async (): Promise<Blob | null> => {
      const mask = maskCanvasRef.current;
      if (!mask) return null;
      return new Promise((resolve) => {
        mask.toBlob((blob) => resolve(blob), "image/png");
      });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        undo,
        redo,
        resetMask,
        exportMaskBlob,
      }),
      [undo, redo, resetMask, exportMaskBlob]
    );

    const stampBrush = useCallback(
      (x: number, y: number) => {
        const mask = maskCanvasRef.current;
        if (!mask) return;
        const mctx = mask.getContext("2d");
        if (!mctx) return;

        const radius = Math.max(1, brushSize / 2);
        const soft = Math.max(0, Math.min(100, brushSoftness)) / 100;

        mctx.save();
        mctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";

        if (soft <= 0.02) {
          mctx.fillStyle = "rgba(255, 255, 255, 1)";
          mctx.beginPath();
          mctx.arc(x, y, radius, 0, Math.PI * 2);
          mctx.fill();
        } else {
          const innerR = Math.max(0, radius * (1 - soft));
          const grad = mctx.createRadialGradient(x, y, innerR, x, y, radius);
          grad.addColorStop(0, "rgba(255, 255, 255, 1)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0)");
          mctx.fillStyle = grad;
          mctx.beginPath();
          mctx.arc(x, y, radius, 0, Math.PI * 2);
          mctx.fill();
        }
        mctx.restore();
      },
      [brushSize, brushSoftness, mode]
    );

    const paintLine = useCallback(
      (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.max(1, (brushSize / 2) * 0.25);
        const steps = Math.max(1, Math.ceil(dist / step));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          stampBrush(from.x + dx * t, from.y + dy * t);
        }
      },
      [brushSize, stampBrush]
    );

    const toImageCoords = useCallback(
      (clientX: number, clientY: number) => {
        const canvas = displayCanvasRef.current;
        if (!canvas || imgDims.w === 0) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
          x: ((clientX - rect.left) / rect.width) * imgDims.w,
          y: ((clientY - rect.top) / rect.height) * imgDims.h,
          displayScale: rect.width / imgDims.w,
        };
      },
      [imgDims]
    );

    const updateCursor = useCallback(
      (clientX: number, clientY: number) => {
        const container = containerRef.current;
        const canvas = displayCanvasRef.current;
        if (!container || !canvas || imgDims.w === 0) {
          setCursorPos(null);
          return;
        }
        const cRect = container.getBoundingClientRect();
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
          setDisplayScale(rect.width / imgDims.w);
        }
        setShowCenterPreview(false);
        setCursorPos({
          x: clientX - cRect.left,
          y: clientY - cRect.top,
        });
      },
      [imgDims.w]
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (loading) return;
      // Move mode, Right-click, Middle-mouse, or Space+Left click -> Pan
      if (
        (e.button === 0 && mode === "pan") ||
        e.button === 1 ||
        e.button === 2 ||
        (e.button === 0 && spaceHeld)
      ) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsPanning(true);
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: pan.x,
          panY: pan.y,
        };
        return;
      }

      if (e.button !== 0) return;
      const pt = toImageCoords(e.clientX, e.clientY);
      if (!pt) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      pushUndoSnapshot();
      setIsPainting(true);
      lastPtRef.current = { x: pt.x, y: pt.y };
      stampBrush(pt.x, pt.y);
      renderDisplay();
      updateCursor(e.clientX, e.clientY);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      updateCursor(e.clientX, e.clientY);

      if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        onPanChange({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        });
        return;
      }

      if (!isPainting) return;
      const pt = toImageCoords(e.clientX, e.clientY);
      if (!pt) return;
      if (lastPtRef.current) {
        paintLine(lastPtRef.current, { x: pt.x, y: pt.y });
      } else {
        stampBrush(pt.x, pt.y);
      }
      lastPtRef.current = { x: pt.x, y: pt.y };
      renderDisplay();
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning) {
        setIsPanning(false);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }
      if (isPainting) {
        setIsPainting(false);
        lastPtRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    return (
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onPointerLeave={() => {
          setCursorPos(null);
          if (isPainting) {
            setIsPainting(false);
            lastPtRef.current = null;
          }
          if (isPanning) setIsPanning(false);
        }}
        className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none touch-none ${
          mode === "pan" || spaceHeld || isPanning
            ? isPanning
              ? "cursor-grabbing"
              : "cursor-grab"
            : "cursor-none"
        }`}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-sky-500 animate-spin" />
          </div>
        )}

        <canvas
          ref={displayCanvasRef}
          className={`max-h-full max-w-full object-contain pointer-events-none select-none transition-opacity duration-150 ${
            loading ? "opacity-0" : "opacity-100"
          }`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
            transformOrigin: "center center",
          }}
        />

        {/* Real-view circular brush size cursor (at pointer, or centered while dragging sidebar slider) */}
        {!loading && mode !== "pan" && !spaceHeld && !isPanning && (cursorPos || showCenterPreview) && (
          <div
            className="pointer-events-none absolute z-30 rounded-full border-2 border-dashed border-white shadow-[0_0_0_1.5px_rgba(15,23,42,0.85)] flex items-center justify-center"
            style={{
              left: cursorPos ? cursorPos.x : "50%",
              top: cursorPos ? cursorPos.y : "50%",
              width: Math.max(4, brushSize * displayScale),
              height: Math.max(4, brushSize * displayScale),
              transform: "translate(-50%, -50%)",
            }}
          >
            <span
              className={`w-1 h-1 rounded-full ${
                mode === "erase" ? "bg-rose-400" : "bg-emerald-400"
              } shadow-[0_0_2px_rgba(0,0,0,0.8)]`}
            />
          </div>
        )}
      </div>
    );
  }
);

ManualBgBrushCanvas.displayName = "ManualBgBrushCanvas";

