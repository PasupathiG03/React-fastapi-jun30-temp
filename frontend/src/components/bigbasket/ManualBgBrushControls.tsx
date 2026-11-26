import React from "react";
import {
  Brush,
  Check,
  Eraser,
  Minus,
  Move,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { BrushMode } from "./ManualBgBrushCanvas";

interface ManualBgBrushControlsProps {
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  mode: BrushMode;
  onModeChange: (mode: BrushMode) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  brushSoftness: number;
  onBrushSoftnessChange: (softness: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount?: number;
  redoCount?: number;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onSave: () => void;
  onSaveAndApprove: () => void;
  saving?: boolean;
  disabled?: boolean;
}

export const ManualBgBrushControls: React.FC<ManualBgBrushControlsProps> = ({
  enabled,
  onToggleEnabled,
  mode,
  onModeChange,
  brushSize,
  onBrushSizeChange,
  brushSoftness,
  onBrushSoftnessChange,
  canUndo,
  canRedo,
  undoCount = 0,
  redoCount = 0,
  onUndo,
  onRedo,
  onReset,
  onSave,
  onSaveAndApprove,
  saving = false,
  disabled = false,
}) => {
  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      {/* Header + On/Off Switch (Microsoft Photos style) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brush className="w-4 h-4 text-sky-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Background Brush Tool
          </h3>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={disabled || saving}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleEnabled(!enabled);
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out disabled:opacity-50 ${
            enabled ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
          }`}
          title={enabled ? "Turn off manual brush tool" : "Turn on manual brush tool"}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {!enabled ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Turn on to manually erase remaining background or restore product edges with a live-size brush.
        </p>
      ) : (
        <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-white/5">
          {/* Erase / Restore / Move Segmented Mode */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10">
            <button
              type="button"
              onClick={() => onModeChange("erase")}
              className={`inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                mode === "erase"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/5"
              }`}
              title="Erase background pixels"
            >
              <Eraser className="w-3.5 h-3.5 shrink-0" />
              <span>Erase BG</span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange("restore")}
              className={`inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                mode === "restore"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/5"
              }`}
              title="Brush back / restore original product pixels"
            >
              <Brush className="w-3.5 h-3.5 shrink-0" />
              <span>Brush (Add)</span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange("pan")}
              className={`inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                mode === "pan"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/5"
              }`}
              title="Drag to move / pan image (or right-click drag anytime)"
            >
              <Move className="w-3.5 h-3.5 shrink-0" />
              <span>Move</span>
            </button>
          </div>

          {/* Brush Size Slider + -/+ Buttons */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Brush size</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onBrushSizeChange(Math.max(5, brushSize - 5))}
                  className="p-1 rounded-md bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200"
                  title="Decrease brush size ([)"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-9 text-center font-mono text-xs font-bold text-slate-900 dark:text-white">
                  {brushSize}
                </span>
                <button
                  type="button"
                  onClick={() => onBrushSizeChange(Math.min(250, brushSize + 5))}
                  className="p-1 rounded-md bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200"
                  title="Increase brush size (])"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
            <input
              type="range"
              min={5}
              max={250}
              step={1}
              value={brushSize}
              onChange={(e) => onBrushSizeChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
          </div>

          {/* Brush Softness Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Brush softness</span>
              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                {brushSoftness}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={brushSoftness}
              onChange={(e) => onBrushSoftnessChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
          </div>

          {/* History Row */}
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              type="button"
              disabled={!canUndo || saving}
              onClick={(e) => {
                e.currentTarget.blur();
                onUndo();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 text-[11px] font-semibold disabled:opacity-40"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              {undoCount > 0 && <span className="font-mono text-[10px]">{undoCount}</span>}
            </button>
            <button
              type="button"
              disabled={!canRedo || saving}
              onClick={(e) => {
                e.currentTarget.blur();
                onRedo();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 text-[11px] font-semibold disabled:opacity-40"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              {redoCount > 0 && <span className="font-mono text-[10px]">{redoCount}</span>}
            </button>
          </div>

          {/* Reset, Save & Apply, and Save & Approve Actions */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onReset}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 border border-slate-200 dark:border-white/10 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset background</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onSave}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 shadow-sm transition-colors disabled:opacity-50"
                title="Save edited output without changing approval status"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saving ? "Applying..." : "Save & Apply"}</span>
              </button>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={onSaveAndApprove}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-colors disabled:opacity-50"
              title="Save edited output, record audit log, and mark image as Manually Approved"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? "Saving & Approving..." : "Save & Approve"}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
            <div>
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">E</kbd>{" "}
              Erase ·{" "}
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">B</kbd>{" "}
              Brush ·{" "}
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">V</kbd>{" "}
              Move
            </div>
            <div className="text-right">
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">[</kbd>{" "}
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">]</kbd>{" "}
              Size
            </div>
            <div>
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">Ctrl+Z</kbd>{" "}
              Undo ·{" "}
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">Ctrl+Y</kbd>{" "}
              Redo
            </div>
            <div className="text-right">
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">+</kbd>{" "}
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">-</kbd>{" "}
              Zoom ·{" "}
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">0</kbd>{" "}
              Reset
            </div>
            <div className="col-span-2 text-center pt-0.5">
              <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">←↑↓→</kbd>{" "}
              / <kbd className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 font-mono text-slate-700 dark:text-slate-200">Space</kbd>{" "}
              / <span className="font-medium text-slate-700 dark:text-slate-200">Right-drag</span> to pan
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

