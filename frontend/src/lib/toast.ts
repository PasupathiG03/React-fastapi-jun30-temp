import { createElement } from "react";
import { toast } from "react-hot-toast";
import { CheckCircle2, XCircle, Trash2, Info, Pencil } from "lucide-react";

type Variant = "success" | "error" | "delete" | "info" | "update";

const PALETTE: Record<
  Variant,
  { icon: typeof CheckCircle2; light: [string, string, string]; dark: [string, string, string] }
> = {
  // [background, text, border]
  success: { icon: CheckCircle2, light: ["#ECFDF5", "#065F46", "#A7F3D0"], dark: ["#052e22", "#6EE7B7", "#065F46"] },
  error: { icon: XCircle, light: ["#FEF2F2", "#991B1B", "#FECACA"], dark: ["#2d0a0a", "#FCA5A5", "#7F1D1D"] },
  delete: { icon: Trash2, light: ["#FFF7ED", "#9A3412", "#FDBA74"], dark: ["#2b1304", "#FDBA74", "#7C2D12"] },
  info: { icon: Info, light: ["#EFF6FF", "#1E40AF", "#BFDBFE"], dark: ["#0b1a3d", "#93C5FD", "#1E3A8A"] },
  update: { icon: Pencil, light: ["#F5F3FF", "#5B21B6", "#DDD6FE"], dark: ["#1e1033", "#C4B5FD", "#5B21B6"] },
};

function isDark() {
  return document.documentElement.classList.contains("dark");
}

function show(variant: Variant, message: string) {
  const { icon: Icon, light, dark } = PALETTE[variant];
  const [background, color, border] = isDark() ? dark : light;
  return toast(message, {
    icon: createElement(Icon, { size: 20, style: { color }, className: "shrink-0" }),
    style: {
      background,
      color,
      border: `1px solid ${border}`,
      borderRadius: "0.75rem",
      padding: "10px 14px",
      fontSize: "0.875rem",
      fontWeight: 500,
      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    },
  });
}

export const showSuccess = (message: string) => show("success", message);
export const showError = (message: string) => show("error", message);
export const showDelete = (message: string) => show("delete", message);
export const showInfo = (message: string) => show("info", message);
export const showUpdate = (message: string) => show("update", message);
