interface SkipClassificationCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** When checked, the Rerun buttons skip Gemini image classification and always remove the background. */
export default function SkipClassificationCheckbox({ checked, onChange, disabled = false }: SkipClassificationCheckboxProps) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs transition-colors ${
        checked
          ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40"
          : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-violet-600 cursor-pointer disabled:cursor-not-allowed"
      />
      <span className="leading-snug">
        <span className="block font-semibold text-slate-700 dark:text-slate-200">Force background removal</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
          {checked
            ? "Rerun skips Gemini classification and always removes the background."
            : "Rerun uses Gemini classification to decide whether to remove the background."}
        </span>
      </span>
    </label>
  );
}
