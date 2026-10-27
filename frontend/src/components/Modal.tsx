import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2, X } from "lucide-react";

const SIZE_CLASS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, newest last: Escape and the focus trap only act on the top one when dialogs stack
// (e.g. a delete confirmation opened from inside a form).
const openStack: symbol[] = [];

/**
 * Keyboard and focus behaviour every dialog needs: Escape closes the top dialog, Tab stays inside it,
 * the first field (or the panel) gets focus on open, and focus goes back to whatever opened it on close.
 */
function useDialogBehaviour(panelRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = Symbol("dialog");
    openStack.push(id);
    const returnTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Prefer a text field so the user can type straight away; fall back to the panel itself rather than
    // the close button, so a stray Enter doesn't dismiss the dialog.
    const firstField = panel?.querySelector<HTMLElement>("input:not([disabled]):not([type='hidden']), textarea:not([disabled])");
    (firstField ?? panel)?.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== id || !panel) return;
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      // Only trap Tab while focus is in the panel: a portaled dropdown (CustomSelect) handles its own keys.
      if (e.key !== "Tab" || !panel.contains(document.activeElement)) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      openStack.splice(openStack.indexOf(id), 1);
      if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, [panelRef]);
}

interface ModalProps {
  /** Shown in the header; also the dialog's accessible name. */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Brand-gradient tile next to the title, like PageHeader. */
  icon?: React.ElementType;
  /** Replaces the icon + title block (e.g. a wizard's step indicator). `title` is still used as the label. */
  header?: React.ReactNode;
  onClose: () => void;
  size?: keyof typeof SIZE_CLASS;
  /** Forms keep their input when the backdrop is clicked by accident; short dialogs can opt in. */
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}

/** Glass dialog rendered into document.body. Children are the body and footer (see ModalBody / ModalFooter). */
export default function Modal({
  title,
  subtitle,
  icon: Icon,
  header,
  onClose,
  size = "lg",
  closeOnBackdrop = false,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehaviour(panelRef, onClose);

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm modal-backdrop-in" aria-hidden="true" />
      <div
        className="relative min-h-full flex items-center justify-center p-4"
        onMouseDown={(e) => {
          if (closeOnBackdrop && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`glass-modal rounded-2xl w-full ${SIZE_CLASS[size]} focus:outline-none`}
        >
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between gap-3 rounded-t-2xl bg-white/30 dark:bg-white/[0.02]">
            {header ? (
              <div className="min-w-0 flex-1">
                <span id={titleId} className="sr-only">{title}</span>
                {header}
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white bg-gradient-to-br from-[#00c6ff] to-[#0072ff] shadow-[0_2px_10px_rgba(0,132,255,0.35)]">
                    <Icon className="w-4 h-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <h2 id={titleId} className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {title}
                  </h2>
                  {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</p>}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 -mr-1.5 rounded-xl flex items-center justify-center shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ModalBody({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`p-5 sm:p-6 space-y-5 ${className}`}>{children}</div>;
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 sm:px-6 py-4 bg-white/30 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex flex-wrap items-center justify-end gap-3 rounded-b-2xl">
      {children}
    </div>
  );
}

/** Text button for Cancel / Back in a modal footer. */
export function ModalCancelButton({ onClick, children = "Cancel" }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors"
    >
      {children}
    </button>
  );
}

interface ConfirmDialogProps {
  title: string;
  /** Name the thing being changed, e.g. <>Delete <b>Admin</b>? This can't be undone.</> */
  message: React.ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  /** Destructive (red, trash icon) by default; `false` for a neutral confirmation. */
  danger?: boolean;
  /** May return a promise: the button shows `busyLabel` and both buttons are disabled until it settles. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** Small centred confirmation used before deleting or otherwise discarding something. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busyLabel = "Deleting...",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  useDialogBehaviour(panelRef, () => {
    if (!busy) onCancel();
  });

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  const Icon = danger ? Trash2 : AlertTriangle;

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm modal-backdrop-in" aria-hidden="true" />
      <div
        className="relative min-h-full flex items-center justify-center p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <div
          ref={panelRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="glass-modal rounded-2xl p-6 max-w-sm w-full text-center focus:outline-none"
        >
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-8 ${danger
              ? "bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-rose-50 dark:ring-rose-500/[0.06]"
              : "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-50 dark:ring-amber-500/[0.06]"
              }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <h3 id={titleId} className="text-base font-bold text-slate-900 dark:text-white mb-2">
            {title}
          </h3>
          <div className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 mb-6 break-words">{message}</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 glass-btn border border-slate-200 dark:border-white/10 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-sm transition-colors disabled:opacity-60 ${danger ? "bg-rose-600 hover:bg-rose-500" : "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500"
                }`}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
