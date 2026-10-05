import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface CustomSelectProps<T extends string | number = string | number> {
  value: T | undefined | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  direction?: "down" | "up" | "auto";
  prefixIcon?: React.ReactNode;
  id?: string;
  name?: string;
  ariaLabel?: string;
}

export function CustomSelect<T extends string | number = string | number>({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  size = "md",
  className = "",
  buttonClassName = "",
  dropdownClassName = "",
  direction = "auto",
  prefixIcon,
  id,
  name,
  ariaLabel,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  // Screen coordinates for the portaled popup (see below for why it's a portal, not `absolute`).
  const [pos, setPos] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Find currently selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Calculate opening direction and the popup's screen position. A plain `absolute` popup would get
  // clipped by any ancestor with `overflow-hidden` (e.g. the card wrapping a table + its pagination
  // footer) -- portaling to <body> with `fixed` coordinates (same pattern as Sidebar.tsx's FlyoutGroup)
  // sidesteps that entirely.
  const updateDirection = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    let upward: boolean;
    if (direction === "up") upward = true;
    else if (direction === "down") upward = false;
    else {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // If less than 220px below and more space above, open upward
      upward = spaceBelow < 220 && spaceAbove > spaceBelow;
    }
    setOpenUpward(upward);
    setPos({ top: rect.bottom, bottom: window.innerHeight - rect.top, left: rect.left, width: rect.width });
  }, [direction]);

  // Handle open toggle
  const toggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      updateDirection();
    }
    setIsOpen((prev) => !prev);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    // The popup is portaled out of its scrolling container, so it can't track a scroll there --
    // closing (rather than silently drifting out of place) matches how the rest of the app behaves.
    // Scrolling the popup's own option list must NOT close it, so that's excluded here.
    const handleScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  // Size styling tokens
  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs rounded-lg min-h-[30px]",
    md: "px-3 py-2 text-xs md:text-sm rounded-xl min-h-[38px]",
    lg: "px-3.5 py-2.5 text-sm md:text-base rounded-xl min-h-[44px]",
  }[size];

  const chevronSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  }[size];

  const itemPadding = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3 py-2 text-xs md:text-sm",
    lg: "px-3.5 py-2.5 text-sm",
  }[size];

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${className}`}
    >
      {/* Hidden input for form compatibility if name is provided */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={value ?? ""}
          id={id}
        />
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        className={`w-full flex items-center justify-between gap-2.5 font-medium transition-all duration-150 cursor-pointer select-none text-left
          ${sizeClasses}
          ${disabled
            ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400"
            : isOpen
              ? "border-sky-500/80 dark:border-sky-400/80 ring-2 ring-sky-500/20 glass-field text-slate-900 dark:text-white"
              : "border border-slate-200/90 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 glass-field hover:bg-white/70 dark:hover:bg-[#0e1a38] text-slate-800 dark:text-slate-200"
          }
          ${buttonClassName}
        `}
      >
        <div className="flex items-center gap-2 truncate">
          {prefixIcon && <span className="text-slate-400 shrink-0">{prefixIcon}</span>}
          {selectedOption?.icon && (
            <span className="shrink-0">{selectedOption.icon}</span>
          )}
          <span className={`truncate ${!selectedOption ? "text-slate-400 dark:text-slate-500 font-normal" : ""}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <ChevronDown
          className={`shrink-0 text-slate-400 dark:text-slate-400 transition-transform duration-200 ${chevronSizes} ${isOpen ? "rotate-180 text-sky-500 dark:text-sky-400" : ""
            }`}
        />
      </button>

      {/* Dropdown Menu Popup: portaled to <body> with fixed coordinates so it's never clipped by an
          `overflow-hidden` ancestor (e.g. the card wrapping a table + its pagination footer). */}
      {isOpen && pos &&
        createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className={`fixed z-[1000] min-w-[var(--select-w)] w-max max-w-[min(100vw-2rem,24rem)] py-1.5 rounded-xl
            ${openUpward ? "origin-bottom" : "origin-top"}
            glass-menu
            ${dropdownClassName}
          `}
          style={{
            left: pos.left,
            ["--select-w" as any]: `${pos.width}px`,
            ...(openUpward ? { bottom: pos.bottom + 6 } : { top: pos.top + 6 }),
          }}
        >
          <div className="max-h-60 overflow-y-auto overflow-x-hidden p-1 space-y-0.5 custom-scrollbar">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 text-center">
                No options available
              </div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => {
                      if (!option.disabled) {
                        onChange(option.value);
                        setIsOpen(false);
                      }
                    }}
                    className={`w-full flex items-center justify-between gap-3 rounded-lg text-left transition-colors cursor-pointer select-none
                      ${itemPadding}
                      ${option.disabled
                        ? "opacity-40 cursor-not-allowed text-slate-400"
                        : isSelected
                          ? "bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:text-slate-900 dark:hover:text-white font-medium"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {option.icon && (
                        <span className="shrink-0">{option.icon}</span>
                      )}
                      <div className="truncate">
                        <div className="truncate">{option.label}</div>
                        {option.description && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 font-normal truncate">
                            {option.description}
                          </div>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
