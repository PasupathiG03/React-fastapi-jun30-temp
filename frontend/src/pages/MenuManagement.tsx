
import { useEffect, useState } from "react";
import { Plus, Trash2, X, Edit2, Cog, Layers } from "lucide-react";
import { createPortal } from "react-dom";
import { TablePagination, TableToolbar } from "@/components/DataTableControls";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { getProcessIcon, getScreenIcon } from "@/components/Sidebar";
import { useTableData } from "@/hooks/useTableData";
import { exportToCsv } from "@/lib/exportData";
import {
  createProcess,
  deleteProcess,
  fetchProcesses,
  updateProcess,
  type ProcessItem,
  type ProcessCreatePayload,
} from "@/services/process";
import {
  createMenu,
  deleteMenu,
  fetchAllMenus,
  updateMenu,
  type MenuItem,
  type MenuCreatePayload,
} from "@/services/menu";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Toggle switch ────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/30 ${checked
          ? "bg-gradient-to-r from-sky-500 to-blue-600 shadow-[0_0_8px_rgba(14,165,233,0.35)]"
          : "bg-slate-300 dark:bg-white/10"
        }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ease-out ${checked ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
      />
    </button>
  );
}

// ── Add/Edit Process Modal ──────────────────────────────────────────────

interface ProcessModalProps {
  nextOrder: number;
  editing: ProcessItem | null;
  onClose: () => void;
  onSaved: (process: ProcessItem) => void;
}

function ProcessModal({ nextOrder, editing, onClose, onSaved }: ProcessModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [order, setOrder] = useState(editing?.order ?? nextOrder);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Process Name is required");

    setSubmitting(true);
    try {
      const payload: ProcessCreatePayload = {
        name: name.trim(),
        description: description.trim() || null,
        order: Math.max(1, Number(order) || 1),
        is_active: isActive,
      };
      const saved = editing ? await updateProcess(editing.id, payload) : await createProcess(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save process");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-lg overflow-visible">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between rounded-t-2xl bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            {editing ? <Edit2 className="w-4 h-4 text-sky-500" /> : <Plus className="w-4 h-4 text-sky-500" />}
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{editing ? "Edit Process" : "Add Process"}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 space-y-4">
            <div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Process Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter process name"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-[#0e1a38] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Description</label>
              <input
                type="text"
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-[#0e1a38] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Order</label>
              <input
                type="number"
                min={1}
                value={order}
                onChange={(e) => setOrder(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-[#0e1a38] focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Position in the sidebar: 1 is shown first, then 2, 3 and so on.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Toggle checked={isActive} onChange={setIsActive} />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active</span>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 transition-all disabled:opacity-60 shadow-sm"
            >
              {editing ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {submitting ? "Saving..." : editing ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Add/Edit Screen Modal ───────────────────────────────────────────────

interface ScreenModalProps {
  processId: number;
  nextOrder: number;
  editing: MenuItem | null;
  onClose: () => void;
  onSaved: (menu: MenuItem) => void;
}

function ScreenModal({ processId, nextOrder, editing, onClose, onSaved }: ScreenModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [route, setRoute] = useState(editing?.url ?? "");
  const [routeEdited, setRouteEdited] = useState(!!editing);
  const [order, setOrder] = useState(Math.max(1, editing?.order ?? nextOrder));
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!routeEdited) setRoute(name ? `/${toSlug(name)}` : "");
  }, [name, routeEdited]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Screen Name is required");
    if (!route.trim()) return setError("Route is required");

    setSubmitting(true);
    try {
      const payload: MenuCreatePayload = {
        name: name.trim(),
        url: route.trim(),
        order,
        process_id: processId,
      };
      const saved = editing
        ? await updateMenu(editing.id, { ...payload, is_active: isActive })
        : await createMenu(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save screen");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-xl overflow-visible">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between rounded-t-2xl bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            {editing ? <Edit2 className="w-4 h-4 text-sky-500" /> : <Plus className="w-4 h-4 text-sky-500" />}
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{editing ? "Edit Screen" : "Add Screen"}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Screen Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sales Dashboard"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-[#0e1a38] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Route <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={route}
                  onChange={(e) => {
                    setRoute(e.target.value);
                    setRouteEdited(true);
                  }}
                  placeholder="e.g. /sales/dashboard"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-[#0e1a38] placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Order</label>
                <input
                  type="number"
                  value={order}
                  min={1}
                  onChange={(e) => setOrder(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-[#0e1a38] focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Toggle checked={isActive} onChange={setIsActive} />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active</span>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 transition-all disabled:opacity-60 shadow-sm"
            >
              {editing ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {submitting ? "Saving..." : editing ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function MenuManagementPage({ mode }: { mode?: "process" | "screen" }) {
  // No mode = the combined "Router Setup" page: processes on the left, their screens on the right.
  const isProcessMode = mode === "process";
  const canManageProcesses = mode !== "screen";
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [screens, setScreens] = useState<MenuItem[]>([]);
  const [loadingProcesses, setLoadingProcesses] = useState(true);
  const [loadingScreens, setLoadingScreens] = useState(false);

  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<ProcessItem | null>(null);
  const [screenModalOpen, setScreenModalOpen] = useState(false);
  const [editingScreen, setEditingScreen] = useState<MenuItem | null>(null);

  const [processToDelete, setProcessToDelete] = useState<ProcessItem | null>(null);
  const [screenToDelete, setScreenToDelete] = useState<MenuItem | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedProcessId != null) loadScreens(selectedProcessId);
  }, [selectedProcessId]);

  async function loadProcesses() {
    try {
      const data = await fetchProcesses();
      setProcesses(data);
      if (data.length > 0) setSelectedProcessId((prev) => prev ?? data[0].id);
    } catch {
      // silently fail — non-superusers get 403
    } finally {
      setLoadingProcesses(false);
    }
  }

  async function loadScreens(processId: number) {
    setLoadingScreens(true);
    try {
      const data = await fetchAllMenus(processId);
      setScreens(data);
    } catch {
      // silently fail
    } finally {
      setLoadingScreens(false);
    }
  }

  function flash(message: string) {
    setSuccess(message);
    setTimeout(() => setSuccess(""), 3000);
  }

  function handleProcessSaved(process: ProcessItem) {
    setProcesses((prev) => {
      const exists = prev.some((p) => p.id === process.id);
      const next = exists ? prev.map((p) => (p.id === process.id ? process : p)) : [...prev, process];
      return next.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    });
    setSelectedProcessId(process.id);
    setProcessModalOpen(false);
    setEditingProcess(null);
    flash(`Process "${process.name}" saved`);
  }

  async function handleDeleteProcessConfirm() {
    if (!processToDelete) return;
    try {
      await deleteProcess(processToDelete.id);
      setProcesses((prev) => prev.filter((p) => p.id !== processToDelete.id));
      if (selectedProcessId === processToDelete.id) {
        const remaining = processes.filter((p) => p.id !== processToDelete.id);
        setSelectedProcessId(remaining[0]?.id ?? null);
        setScreens([]);
      }
      setProcessToDelete(null);
      flash("Process deleted successfully");
    } catch {
      setError("Failed to delete process");
    }
  }

  function handleScreenSaved(menu: MenuItem) {
    setScreens((prev) => {
      const exists = prev.some((m) => m.id === menu.id);
      const next = exists ? prev.map((m) => (m.id === menu.id ? menu : m)) : [...prev, menu];
      return next.sort((a, b) => a.order - b.order || a.id - b.id);
    });
    setScreenModalOpen(false);
    setEditingScreen(null);
    flash(`Screen "${menu.name}" saved`);
  }

  async function handleDeleteScreenConfirm() {
    if (!screenToDelete) return;
    try {
      await deleteMenu(screenToDelete.id);
      setScreens((prev) => prev.filter((m) => m.id !== screenToDelete.id));
      setScreenToDelete(null);
      flash("Screen deleted successfully");
    } catch {
      setError("Failed to delete screen");
    }
  }

  const table = useTableData(screens, (s) =>
    [s.name, s.url, s.is_active ? "active" : "inactive"].filter(Boolean).join(" ")
  );

  function handleExport() {
    exportToCsv(`screens-${(selectedProcess?.name ?? "all").toLowerCase().replace(/\s+/g, "-")}`, [
      { header: "Screen", value: (s) => s.name },
      { header: "Route", value: (s) => s.url },
      { header: "Order", value: (s) => s.order },
      { header: "Status", value: (s) => (s.is_active ? "Active" : "Inactive") },
    ], table.filtered);
  }

  const selectedProcess = processes.find((p) => p.id === selectedProcessId) ?? null;

  return (
    <PageContainer>
      <PageHeader
        icon={Cog}
        title={mode === undefined ? "Router Setup" : isProcessMode ? "Process" : "Screen"}
        subtitle={
          mode === undefined
            ? "Organize sidebar navigation into processes and screens"
            : isProcessMode
              ? "Create the processes that group your screens in the sidebar"
              : "Add and organize the screens inside each process"
        }
      />

      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-100 text-sm text-green-700 shadow-sm">
          ✓ {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600 shadow-sm">
          {error}
        </div>
      )}

      <div className="flex gap-5 items-start">
        {/* ── Processes panel ── */}
        <div className={`${isProcessMode ? "flex-1 min-w-0" : "w-80 shrink-0"} bg-white dark:bg-[#0c1427]/70 backdrop-blur-xl rounded-[22px] border border-slate-200/80 dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)] overflow-hidden transition-colors duration-200`}>
          <div className="px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-500" />
              <h2 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Processes</h2>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                {processes.length}
              </span>
            </div>
            {canManageProcesses && (
              <button
                onClick={() => {
                  setEditingProcess(null);
                  setProcessModalOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-sm hover:shadow-[0_2px_10px_rgba(14,165,233,0.3)] transition-all cursor-pointer"
                title="Add process"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}
          </div>

          <div className="p-2 space-y-1.5">
            {loadingProcesses ? (
              <div className="space-y-1.5 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl border border-transparent flex items-center justify-between gap-3 bg-slate-100/50 dark:bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div
                          className="h-3.5 bg-slate-200 dark:bg-white/10 rounded"
                          style={{ width: `${45 + ((i * 20) % 30)}%` }}
                        />
                        <div className="h-2.5 w-16 bg-slate-100 dark:bg-white/5 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : processes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 px-4">
                <Layers className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs text-center">No processes yet</p>
              </div>
            ) : (
              processes.map((process) => {
                const active = !isProcessMode && process.id === selectedProcessId;
                return (
                  <div key={process.id} className="relative">
                    <button
                      onClick={() => setSelectedProcessId(process.id)}
                      className={`group relative w-full text-left p-2.5 ${isProcessMode ? "pr-24" : ""} rounded-xl transition-all duration-150 flex items-center justify-between gap-3 cursor-pointer ${active
                          ? "bg-sky-50/80 dark:bg-sky-500/15 border border-sky-200/90 dark:border-sky-500/30 shadow-[0_2px_12px_rgba(14,165,233,0.12)]"
                          : "border border-transparent hover:border-slate-200/80 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${active
                              ? "bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-[0_2px_8px_rgba(14,165,233,0.38)]"
                              : "bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:bg-slate-200/80 dark:group-hover:bg-white/10 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                            }`}
                        >
                          {(() => {
                            const Icon = getProcessIcon(process.name);
                            return <Icon className="w-4 h-4" />;
                          })()}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold truncate ${active ? "text-sky-950 dark:text-white" : "text-slate-800 dark:text-slate-200"}`}>
                            <span className="text-slate-400 font-semibold mr-1.5">{process.order}.</span>
                            {process.name}
                          </p>
                          {process.description && (
                            <p className={`text-[11px] truncate mt-0.5 ${active ? "text-sky-700/80 dark:text-sky-300/80" : "text-slate-400 dark:text-slate-500"}`}>
                              {process.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                    {isProcessMode && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingProcess(process);
                            setProcessModalOpen(true);
                          }}
                          className="flex items-center justify-center w-7 h-7 text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                          title="Edit process"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setProcessToDelete(process)}
                          className="flex items-center justify-center w-7 h-7 text-rose-500 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Delete process"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Screens panel ── */}
        {!isProcessMode && (
          <div className="flex-1 min-w-0 bg-white dark:bg-[#0c1427]/70 backdrop-blur-xl rounded-[22px] border border-slate-200/80 dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)] overflow-hidden transition-colors duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedProcess ? `Screens in ${selectedProcess.name}` : "Screens"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedProcess?.description || "No description."}</p>
              </div>
              {selectedProcess && (
                <div className="flex items-center gap-2 shrink-0">
                  {mode === undefined && (
                    <>
                      <button
                        onClick={() => {
                          setEditingProcess(selectedProcess);
                          setProcessModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit Process
                      </button>
                      <button
                        onClick={() => setProcessToDelete(selectedProcess)}
                        className="flex items-center justify-center w-8 h-8 text-rose-500 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        title="Delete process"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setEditingScreen(null);
                      setScreenModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-sm transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Add Screen
                  </button>
                </div>
              )}
            </div>

            {!selectedProcess && !loadingProcesses ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Layers className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Select or create a process to manage its screens</p>
              </div>
            ) : (
              <>
                <div className="px-6 py-3 border-b border-slate-100 dark:border-white/[0.06] flex justify-end">
                  <TableToolbar
                    query={table.query}
                    onQueryChange={table.setQuery}
                    onExport={handleExport}
                    exportDisabled={table.filtered.length === 0}
                    placeholder="Search screens..."
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide border-b border-slate-100 dark:border-white/[0.06]">
                        <th className="px-6 py-3">Screen</th>
                        <th className="px-6 py-3">Route</th>
                        <th className="px-6 py-3">Order</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                      {loadingScreens || loadingProcesses ? (
                        [1, 2, 3, 4, 5].map((i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="px-6 py-3.5">
                              <div
                                className="h-3.5 bg-slate-200 dark:bg-white/10 rounded"
                                style={{ width: `${50 + ((i * 18) % 35)}%` }}
                              />
                            </td>
                            <td className="px-6 py-3.5">
                              <div
                                className="h-3 bg-slate-100 dark:bg-white/5 rounded font-mono"
                                style={{ width: `${60 + ((i * 15) % 25)}%` }}
                              />
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="h-3 w-5 bg-slate-100 dark:bg-white/5 rounded" />
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="h-5 w-14 bg-slate-100 dark:bg-white/5 rounded-full" />
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/5" />
                                <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/5" />
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : table.filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                            <Cog className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">{screens.length === 0 ? "No screens yet" : "No results match your search"}</p>
                            {screens.length === 0 && <p className="text-xs mt-0.5">Add your first screen above</p>}
                          </td>
                        </tr>
                      ) : (
                        table.paged.map((screen) => (
                          <tr key={screen.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-2.5">
                                {(() => {
                                  const Icon = getScreenIcon(screen.name, screen.url, screen.icon);
                                  return <Icon className="w-4 h-4 text-slate-400 shrink-0" />;
                                })()}
                                <span>{screen.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-3.5 font-mono text-xs text-sky-600 dark:text-sky-400">{screen.url}</td>
                            <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">{screen.order}</td>
                            <td className="px-6 py-3.5">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${screen.is_active
                                    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                                    : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                                  }`}
                              >
                                {screen.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingScreen(screen);
                                    setScreenModalOpen(true);
                                  }}
                                  className="flex items-center justify-center w-7 h-7 text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                  title="Edit screen"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setScreenToDelete(screen)}
                                  className="flex items-center justify-center w-7 h-7 text-rose-500 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                  title="Delete screen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={table.page}
                  pageSize={table.pageSize}
                  totalPages={table.totalPages}
                  totalItems={table.filtered.length}
                  onPageChange={table.setPage}
                  onPageSizeChange={table.setPageSize}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Process modal */}
      {processModalOpen && (
        <ProcessModal
          nextOrder={Math.max(0, ...processes.map((p) => p.order)) + 1}
          editing={editingProcess}
          onClose={() => {
            setProcessModalOpen(false);
            setEditingProcess(null);
          }}
          onSaved={handleProcessSaved}
        />
      )}

      {/* Screen modal */}
      {screenModalOpen && selectedProcess && (
        <ScreenModal
          processId={selectedProcess.id}
          nextOrder={Math.max(0, ...screens.map((s) => s.order)) + 1}
          editing={editingScreen}
          onClose={() => {
            setScreenModalOpen(false);
            setEditingScreen(null);
          }}
          onSaved={handleScreenSaved}
        />
      )}

      {/* Delete process confirmation */}
      {processToDelete && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setProcessToDelete(null)} />
          <div className="relative bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Delete Process?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Are you sure you want to delete <span className="font-semibold text-slate-800 dark:text-slate-200">{processToDelete.name}</span>?
              Its screens won't be shown until reassigned to another process.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setProcessToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProcessConfirm}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete screen confirmation */}
      {screenToDelete && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setScreenToDelete(null)} />
          <div className="relative bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Delete Screen?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Are you sure you want to permanently delete <span className="font-semibold text-slate-800 dark:text-slate-200">{screenToDelete.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setScreenToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteScreenConfirm}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </PageContainer>
  );
}
