import { useEffect, useState } from "react";
import { AlertCircle, Frame, Maximize2, RotateCcw, Save, Settings } from "lucide-react";

import PageContainer, { PageHeader } from "@/components/PageContainer";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { showError, showSuccess } from "@/lib/toast";
import {
  configuredPreset,
  describeOutputPreset,
  fetchImageValidationSettings,
  fetchOutputPreset,
  updateImageValidationSettings,
  updateOutputPreset,
  type ImageValidationSettings,
  type OutputPreset,
} from "@/services/bigbasket";

// Same bounds as the backend schemas (app/schemas/app_setting.py).
const MIN_DIMENSION = 100;
const MAX_DIMENSION = 10000;
const MIN_CANVAS = 500;
const MAX_CANVAS = 6000;
const MIN_DPI = 72;
const MAX_DPI = 1200;
const MAX_PADDING_SHARE = 0.75;

const fieldClass =
  "w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 glass-field placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors";
const errorFieldClass = "border-rose-400 dark:border-rose-500/60 focus:ring-rose-500/30";
const labelClass = "block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5";

function validateInt(raw: string, label: string, min: number, max: number, unit = "px"): string | null {
  if (raw.trim() === "") return `${label} is required.`;
  const n = Number(raw);
  if (!Number.isInteger(n)) return `${label} must be a whole number.`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}${unit ? ` ${unit}` : ""}.`;
  return null;
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// ---------------------------------------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------------------------------------

function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${fieldClass} ${error ? errorFieldClass : ""}`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  status,
  loading,
  loadError,
  onRetry,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  status?: string | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card rounded-[22px] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Icon className="w-4 h-4 text-sky-500" />
          {title}
        </h2>
        {status && <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{status}</span>}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{description}</p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
              <div className="h-10 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10"
        >
          <p className="text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {loadError}
          </p>
          <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
            Try again
          </button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function FormActions({ dirty, canSave, saving, onDiscard }: { dirty: boolean; canSave: boolean; saving: boolean; onDiscard: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 mt-6">
      <button type="button" onClick={onDiscard} disabled={!dirty || saving} className={SECONDARY_BUTTON}>
        <RotateCcw className="w-3.5 h-3.5" />
        Discard changes
      </button>
      <button type="submit" disabled={!canSave} className={PRIMARY_BUTTON}>
        <Save className="w-3.5 h-3.5" />
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function savedStatus(s: { is_configured: boolean; updated_at?: string | null } | null): string | null {
  if (!s) return null;
  if (!s.is_configured) return "Not configured: enter values and save";
  return s.updated_at ? `Last updated ${new Date(s.updated_at).toLocaleString()}` : null;
}

/** Form text for a stored number; empty when nothing has been saved. */
function asField(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

// ---------------------------------------------------------------------------------------------------------
// Validation Resolution Dimensions
// ---------------------------------------------------------------------------------------------------------

function ResolutionSettings() {
  const [saved, setSaved] = useState<ImageValidationSettings | null>(null);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function apply(s: ImageValidationSettings) {
    setSaved(s);
    setWidth(asField(s.min_width));
    setHeight(asField(s.min_height));
  }

  useEffect(() => {
    fetchImageValidationSettings()
      .then(apply)
      .catch((e) => setLoadError(errorMessage(e, "Could not load the settings.")))
      .finally(() => setLoading(false));
  }, []);

  function retry() {
    setLoading(true);
    setLoadError(null);
    fetchImageValidationSettings()
      .then(apply)
      .catch((e) => setLoadError(errorMessage(e, "Could not load the settings.")))
      .finally(() => setLoading(false));
  }

  const widthError = validateInt(width, "Min width", MIN_DIMENSION, MAX_DIMENSION);
  const heightError = validateInt(height, "Min height", MIN_DIMENSION, MAX_DIMENSION);
  const dirty = saved !== null && (width !== asField(saved.min_width) || height !== asField(saved.min_height));
  const canSave = dirty && !widthError && !heightError && !saving;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const s = await updateImageValidationSettings({ min_width: Number(width), min_height: Number(height) });
      apply(s);
      showSuccess(`Minimum resolution set to ${s.min_width} × ${s.min_height} px.`);
    } catch (err) {
      showError(errorMessage(err, "Could not save the settings."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      icon={Maximize2}
      title="Validation Resolution Dimensions"
      description="Images smaller than this are flagged as low resolution when a batch is created."
      status={loading ? null : savedStatus(saved)}
      loading={loading && !saved}
      loadError={loadError}
      onRetry={retry}
    >
      <form onSubmit={handleSave} noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField id="min-width" label="Min Width (px)" value={width} onChange={setWidth} error={widthError} min={MIN_DIMENSION} max={MAX_DIMENSION} />
          <NumberField id="min-height" label="Min Height (px)" value={height} onChange={setHeight} error={heightError} min={MIN_DIMENSION} max={MAX_DIMENSION} />
        </div>
        <FormActions dirty={dirty} canSave={canSave} saving={saving} onDiscard={() => saved && apply(saved)} />
      </form>
    </SettingsCard>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Output Preset (canvas, DPI, padding)
// ---------------------------------------------------------------------------------------------------------

type PresetForm = { canvas_width: string; canvas_height: string; dpi: string; top: string; bottom: string; left: string; right: string };

function toForm(p: OutputPreset): PresetForm {
  return {
    canvas_width: asField(p.canvas_width),
    canvas_height: asField(p.canvas_height),
    dpi: asField(p.dpi),
    top: asField(p.padding?.top),
    bottom: asField(p.padding?.bottom),
    left: asField(p.padding?.left),
    right: asField(p.padding?.right),
  };
}

function OutputPresetSettings() {
  const [saved, setSaved] = useState<OutputPreset | null>(null);
  const [form, setForm] = useState<PresetForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function apply(p: OutputPreset) {
    setSaved(p);
    setForm(toForm(p));
  }

  useEffect(() => {
    fetchOutputPreset()
      .then(apply)
      .catch((e) => setLoadError(errorMessage(e, "Could not load the output preset.")))
      .finally(() => setLoading(false));
  }, []);

  function retry() {
    setLoading(true);
    setLoadError(null);
    fetchOutputPreset()
      .then(apply)
      .catch((e) => setLoadError(errorMessage(e, "Could not load the output preset.")))
      .finally(() => setLoading(false));
  }

  const f = form ?? { canvas_width: "", canvas_height: "", dpi: "", top: "", bottom: "", left: "", right: "" };
  const set = (key: keyof PresetForm) => (v: string) => setForm((prev) => (prev ? { ...prev, [key]: v } : prev));

  const canvasW = Number(f.canvas_width);
  const canvasH = Number(f.canvas_height);
  const errors = {
    canvas_width: validateInt(f.canvas_width, "Canvas width", MIN_CANVAS, MAX_CANVAS),
    canvas_height: validateInt(f.canvas_height, "Canvas height", MIN_CANVAS, MAX_CANVAS),
    dpi: validateInt(f.dpi, "DPI", MIN_DPI, MAX_DPI, ""),
    top: validateInt(f.top, "Top padding", 0, MAX_CANVAS),
    bottom: validateInt(f.bottom, "Bottom padding", 0, MAX_CANVAS),
    left: validateInt(f.left, "Left padding", 0, MAX_CANVAS),
    right: validateInt(f.right, "Right padding", 0, MAX_CANVAS),
  };
  // Leave at least a quarter of the canvas for the product (same rule as the server).
  let paddingError: string | null = null;
  if (!errors.canvas_width && !errors.left && !errors.right && Number(f.left) + Number(f.right) > canvasW * MAX_PADDING_SHARE) {
    paddingError = "Left + right padding must be at most 75% of the canvas width.";
  } else if (!errors.canvas_height && !errors.top && !errors.bottom && Number(f.top) + Number(f.bottom) > canvasH * MAX_PADDING_SHARE) {
    paddingError = "Top + bottom padding must be at most 75% of the canvas height.";
  }

  const dirty = saved !== null && form !== null && JSON.stringify(form) !== JSON.stringify(toForm(saved));
  const valid = Object.values(errors).every((e) => !e) && !paddingError;
  const canSave = dirty && valid && !saving;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const p = await updateOutputPreset({
        canvas_width: canvasW,
        canvas_height: canvasH,
        dpi: Number(f.dpi),
        padding: { top: Number(f.top), bottom: Number(f.bottom), left: Number(f.left), right: Number(f.right) },
      });
      apply(p);
      const values = configuredPreset(p);
      showSuccess(values ? `Output preset saved: ${describeOutputPreset(values)}.` : "Output preset saved.");
    } catch (err) {
      showError(errorMessage(err, "Could not save the output preset."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      icon={Frame}
      title="Output Preset"
      description="Canvas size and DPI apply to every image in a new batch; padding applies to FOP and BOP shots only. Batches already created keep the preset they were created with."
      status={loading ? null : savedStatus(saved)}
      loading={loading && !saved}
      loadError={loadError}
      onRetry={retry}
    >
      <form onSubmit={handleSave} noValidate className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NumberField id="canvas-width" label="Canvas Width (px)" value={f.canvas_width} onChange={set("canvas_width")} error={errors.canvas_width} min={MIN_CANVAS} max={MAX_CANVAS} />
          <NumberField id="canvas-height" label="Canvas Height (px)" value={f.canvas_height} onChange={set("canvas_height")} error={errors.canvas_height} min={MIN_CANVAS} max={MAX_CANVAS} />
          <NumberField id="dpi" label="DPI" value={f.dpi} onChange={set("dpi")} error={errors.dpi} min={MIN_DPI} max={MAX_DPI} />
        </div>

        <fieldset className="p-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] dark:bg-sky-500/[0.06]">
          <legend className="px-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            Product Padding (px)
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
              FOP &amp; BOP only
            </span>
          </legend>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
            Space between the product and the canvas edge on front-of-pack (FOP) and back-of-pack (BOP) shots.
            Other image types, such as nutrition, ingredients, barcode and lifestyle images, fill the canvas edge to
            edge with no padding.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <NumberField id="pad-top" label="Top" value={f.top} onChange={set("top")} error={errors.top} min={0} max={MAX_CANVAS} />
            <NumberField id="pad-bottom" label="Bottom" value={f.bottom} onChange={set("bottom")} error={errors.bottom} min={0} max={MAX_CANVAS} />
            <NumberField id="pad-left" label="Left" value={f.left} onChange={set("left")} error={errors.left} min={0} max={MAX_CANVAS} />
            <NumberField id="pad-right" label="Right" value={f.right} onChange={set("right")} error={errors.right} min={0} max={MAX_CANVAS} />
          </div>
          {paddingError && (
            <p role="alert" className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
              {paddingError}
            </p>
          )}
        </fieldset>

        {valid && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Preview:{" "}
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
              {describeOutputPreset({
                canvas_width: canvasW,
                canvas_height: canvasH,
                dpi: Number(f.dpi),
                padding: { top: Number(f.top), bottom: Number(f.bottom), left: Number(f.left), right: Number(f.right) },
              })}
            </span>
          </p>
        )}

        <FormActions dirty={dirty} canSave={canSave} saving={saving} onDiscard={() => saved && apply(saved)} />
      </form>
    </SettingsCard>
  );
}

export default function ImageAutomationSettings() {
  return (
    <PageContainer>
      <PageHeader
        icon={Settings}
        title="Image Automation Settings"
        subtitle="Values Image Studio uses to validate uploads and produce standardized images"
      />
      <div className="grid grid-cols-1 gap-5 max-w-3xl">
        <ResolutionSettings />
        <OutputPresetSettings />
      </div>
    </PageContainer>
  );
}
