import React from "react";
import { Check } from "lucide-react";

export interface CustomCheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  id?: string;
  name?: string;
  title?: string;
  ariaLabel?: string;
  label?: React.ReactNode;
  description?: string;
}

export function CustomCheckbox({
  checked,
  onChange,
  disabled = false,
  size = "md",
  className = "",
  id,
  name,
  title,
  ariaLabel,
  label,
  description,
}: CustomCheckboxProps) {
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !onChange) return;
    onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || !onChange) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onChange(!checked);
    }
  };

  const sizeConfig = {
    sm: {
      box: "w-4 h-4 rounded-[5px]",
      check: "w-2.5 h-2.5 stroke-[3]",
      border: "border-[1.5px]",
    },
    md: {
      box: "w-5 h-5 rounded-[6px]",
      check: "w-3.5 h-3.5 stroke-[2.75]",
      border: "border-2",
    },
    lg: {
      box: "w-6 h-6 rounded-lg",
      check: "w-4 h-4 stroke-[2.75]",
      border: "border-2",
    },
  }[size];

  const buttonElement = (
    <button
      type="button"
      id={id}
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel || title || (typeof label === "string" ? label : undefined)}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      title={title}
      className={`relative inline-flex items-center justify-center shrink-0 transition-all duration-150 ease-out select-none
        ${sizeConfig.box}
        ${sizeConfig.border}
        ${disabled
          ? checked
            ? "bg-sky-100/80 dark:bg-sky-500/20 border-sky-400/60 dark:border-sky-400/50 text-sky-500 dark:text-sky-400 cursor-not-allowed opacity-90 shadow-none"
            : "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-300 dark:text-slate-600 opacity-60 cursor-not-allowed shadow-none"
          : checked
            ? "bg-sky-100 dark:bg-sky-500/20 border-sky-400 dark:border-sky-400 text-sky-500 dark:text-sky-400 hover:bg-sky-200/60 dark:hover:bg-sky-500/30 hover:border-sky-500 shadow-[0_1px_4px_rgba(14,165,233,0.18)] cursor-pointer"
            : "bg-white dark:bg-[#0c1427] border-slate-300 dark:border-white/20 hover:border-sky-400 dark:hover:border-sky-400/80 hover:bg-sky-50/50 dark:hover:bg-sky-500/10 shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
        }
        focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0c1427]
      `}
    >
      {name && (
        <input
          type="hidden"
          name={name}
          value={checked ? "true" : "false"}
        />
      )}
      <Check
        className={`${sizeConfig.check} transition-all duration-150 ease-out ${checked
            ? "opacity-100 scale-100"
            : "opacity-0 scale-50 pointer-events-none"
          }`}
      />
    </button>
  );

  if (!label && !description) {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {buttonElement}
      </div>
    );
  }

  return (
    <div
      onClick={handleToggle}
      className={`inline-flex items-center gap-2.5 select-none ${disabled ? "cursor-not-allowed" : "cursor-pointer"
        } ${className}`}
    >
      {buttonElement}
      <div className="flex flex-col text-left">
        {label && (
          <span
            className={`text-xs font-semibold ${disabled
                ? "text-slate-400 dark:text-slate-500"
                : "text-slate-800 dark:text-slate-200"
              }`}
          >
            {label}
          </span>
        )}
        {description && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}
