
import { useEffect, useState } from "react";
import { showError, showSuccess, showDelete } from "../lib/toast";
import { Plus, Trash2, Edit2, Cog, GripVertical, Layers, Search } from "lucide-react";
import { TablePagination, TableToolbar } from "@/components/DataTableControls";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { getProcessIcon, getScreenIcon } from "@/components/Sidebar";
import { useTableData } from "@/hooks/useTableData";
import Modal, { ConfirmDialog, ModalCancelButton, ModalFooter } from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import { PRIMARY_BUTTON } from "@/components/ui";
import {
  createProcess,
  deleteProcess,
  fetchProcesses,
  reorderProcesses,
  updateProcess,
  type ProcessItem,
  type ProcessCreatePayload,
} from "@/services/process";
import {
  createMenu,
  deleteMenu,
  fetchAllMenus,
  updateMenu,
  updateMenuOrders,
  type MenuItem,
  type MenuCreatePayload,
} from "@/services/menu";

// Mirrors backend/app/core/builtin_screens.py's PROTECTED_PROCESS_NAMES. These two hold nothing but
// hardcoded Developer nav items (Sidebar.tsx's DEV_DASHBOARD / DEV_ROUTER_SETUP) -- unlike Access
// Control, they are never meant to be managed like a regular process, so Router Setup never lists them.
const HIDDEN_ROUTER_SETUP_PROCESSES = new Set(["Dashboard", "Developer Management"]);

/** Moves the dragged item next to the drop target and renumbers everyone 1..N in the new order.
 * Returns null if nothing actually moved (dropped on itself). */
function reorderById<T extends { id: number; order: number }>(
  items: T[],
  draggedId: number,
  dropOnId: number
): T[] | null {
  if (draggedId === dropOnId) return null;
  const from = items.findIndex((i) => i.id === draggedId);
  const to = items.findIndex((i) => i.id === dropOnId);
  if (from === -1 || to === -1) return null;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((item, idx) => ({ ...item, order: idx + 1 }));
}

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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
  const [order, setOrder] = useState(editing?.order ?? nextOrder);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return showError("Process Name is required");

    setSubmitting(true);
    try {
      const payload: ProcessCreatePayload = {
        name: name.trim(),
        order: Math.max(1, Number(order) || 1),
        is_active: isActive,
      };
      const saved = editing ? await updateProcess(editing.id, payload) : await createProcess(payload);
      onSaved(saved);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save process");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit Process" : "Add Process"}
      subtitle={"A group of screens in the sidebar"}
      icon={editing ? Edit2 : Plus}
      size="lg"
      onClose={onClose}
    >

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
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 glass-field placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Order</label>
              <input
                type="number"
                min={1}
                value={order}
                onChange={(e) => setOrder(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 glass-field focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Position in the sidebar: 1 is shown first, then 2, 3 and so on.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Toggle checked={isActive} onChange={setIsActive} label="Active" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active</span>
            </div>
          </div>

          <ModalFooter>
            <ModalCancelButton onClick={onClose} />
            <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
              {editing ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {submitting ? "Saving..." : editing ? "Save Changes" : "Create"}
            </button>
          </ModalFooter>
        </form>
    </Modal>
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

  useEffect(() => {
    if (!routeEdited) setRoute(name ? `/${toSlug(name)}` : "");
  }, [name, routeEdited]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return showError("Screen Name is required");
    if (!route.trim()) return showError("Route is required");

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
      showError(err instanceof Error ? err.message : "Failed to save screen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit Screen" : "Add Screen"}
      subtitle={"A page users can be granted in Menu Access"}
      icon={editing ? Edit2 : Plus}
      size="xl"
      onClose={onClose}
    >

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
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 glass-field placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
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
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 glass-field placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Order</label>
                <input
                  type="number"
                  value={order}
                  min={1}
                  onChange={(e) => setOrder(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 glass-field focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Toggle checked={isActive} onChange={setIsActive} label="Active" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active</span>
            </div>
          </div>

          <ModalFooter>
            <ModalCancelButton onClick={onClose} />
            <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
              {editing ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {submitting ? "Saving..." : editing ? "Save Changes" : "Create"}
            </button>
          </ModalFooter>
        </form>
    </Modal>
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

  const [draggedProcessId, setDraggedProcessId] = useState<number | null>(null);
  const [dragOverProcessId, setDragOverProcessId] = useState<number | null>(null);
  const [draggedScreenId, setDraggedScreenId] = useState<number | null>(null);
  const [dragOverScreenId, setDragOverScreenId] = useState<number | null>(null);

  function dropProcess(dropOnId: number) {
    setDragOverProcessId(null);
    if (draggedProcessId == null) return;
    const reordered = reorderById(processes, draggedProcessId, dropOnId);
    setDraggedProcessId(null);
    if (!reordered) return;
    const before = processes;
    setProcesses(reordered); // optimistic: no refetch, no reload
    reorderProcesses(reordered.map((p) => ({ id: p.id, order: p.order }))).catch(() => {
      setProcesses(before);
      showError("Failed to save the new process order");
    });
  }

  function dropScreen(dropOnId: number) {
    setDragOverScreenId(null);
    if (draggedScreenId == null) return;
    const reordered = reorderById(screens, draggedScreenId, dropOnId);
    setDraggedScreenId(null);
    if (!reordered) return;
    const before = screens;
    setScreens(reordered); // optimistic: no refetch, no reload
    updateMenuOrders(reordered.map((s) => ({ id: s.id, order: s.order }))).catch(() => {
      setScreens(before);
      showError("Failed to save the new screen order");
    });
  }

  // Deliberately not tied to the live-update stream (useLive): this page loads when it opens and when you pick
  // a process or save something here, and never reloads by itself while you are working on it.
  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedProcessId != null) loadScreens(selectedProcessId);
  }, [selectedProcessId]);

  async function loadProcesses() {
    try {
      const data = (await fetchProcesses()).filter((p) => !HIDDEN_ROUTER_SETUP_PROCESSES.has(p.name));
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

  function handleProcessSaved(process: ProcessItem) {
    setProcesses((prev) => {
      const exists = prev.some((p) => p.id === process.id);
      const next = exists ? prev.map((p) => (p.id === process.id ? process : p)) : [...prev, process];
      return next.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    });
    setSelectedProcessId(process.id);
    setProcessModalOpen(false);
    setEditingProcess(null);
    showSuccess(`Process "${process.name}" saved`);
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
      showDelete(`Process "${processToDelete.name}" deleted`);
    } catch {
      showError("Failed to delete process");
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
    showSuccess(`Screen "${menu.name}" saved`);
  }

  async function handleDeleteScreenConfirm() {
    if (!screenToDelete) return;
    try {
      await deleteMenu(screenToDelete.id);
      setScreens((prev) => prev.filter((m) => m.id !== screenToDelete.id));
      setScreenToDelete(null);
      showDelete(`Screen "${screenToDelete.name}" deleted`);
    } catch (err) {
      setScreenToDelete(null);
      showError(err instanceof Error ? err.message : "Failed to delete screen");
    }
  }

  const table = useTableData(screens, (s) =>
    [s.name, s.url, s.is_active ? "active" : "inactive"].filter(Boolean).join(" ")
  );

  function handleExport() {
    void import("@/lib/exportData").then(({ exportToCsv }) => exportToCsv(`screens-${(selectedProcess?.name ?? "all").toLowerCase().replace(/\s+/g, "-")}`, [
      { header: "Screen", value: (s) => s.name },
      { header: "Route", value: (s) => s.url },
      { header: "Order", value: (s) => s.order },
      { header: "Status", value: (s) => (s.is_active ? "Active" : "Inactive") },
    ], table.filtered));
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
        loading={loadingProcesses}
      />

      <div className="flex flex-col lg:flex-row gap-5 items-stretch lg:items-start">
        {/* ── Processes panel ── */}
        <div className={`${isProcessMode ? "flex-1 min-w-0" : "w-full lg:w-80 lg:shrink-0"} glass-card rounded-[22px] overflow-hidden`}>
          <div className="px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between bg-white/30 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2">
              {loadingProcesses ? (
                <>
                  <span className="w-4 h-4 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
                  <span className="h-3.5 w-16 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
                  <span className="w-5 h-4 rounded-full bg-slate-100 dark:bg-white/10 animate-pulse" />
                </>
              ) : (
                <>
                  <Layers className="w-4 h-4 text-sky-500" />
                  <h2 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Processes</h2>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    {processes.length}
                  </span>
                </>
              )}
            </div>
            {canManageProcesses && (
              loadingProcesses ? (
                <div className="h-6 w-16 rounded-lg bg-slate-100 dark:bg-white/10 animate-pulse" />
              ) : (
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
              )
            )}
          </div>

          <div className="p-2 space-y-1.5">
            {loadingProcesses ? (
              <div className="space-y-1.5 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl border border-transparent flex items-center justify-between gap-3 bg-white/30 dark:bg-white/[0.02]"
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
              <EmptyState compact icon={Layers} title="No processes yet" description="Add one with the + button above." />
            ) : (
              processes.map((process) => {
                const active = !isProcessMode && process.id === selectedProcessId;
                return (
                  <div
                    key={process.id}
                    className={`relative rounded-xl transition-all ${dragOverProcessId === process.id ? "ring-2 ring-sky-400" : ""} ${draggedProcessId === process.id ? "opacity-40" : ""}`}
                    draggable={canManageProcesses}
                    onDragStart={() => setDraggedProcessId(process.id)}
                    onDragEnd={() => {
                      setDraggedProcessId(null);
                      setDragOverProcessId(null);
                    }}
                    onDragOver={(e) => {
                      if (draggedProcessId == null) return;
                      e.preventDefault();
                      if (dragOverProcessId !== process.id) setDragOverProcessId(process.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropProcess(process.id);
                    }}
                  >
                    <button
                      onClick={() => setSelectedProcessId(process.id)}
                      className={`group relative w-full text-left p-2.5 ${isProcessMode ? "pr-24" : ""} rounded-xl transition-all duration-150 flex items-center justify-between gap-3 cursor-pointer ${active
                        ? "bg-sky-50/80 dark:bg-sky-500/15 border border-sky-200/90 dark:border-sky-500/30 shadow-[0_2px_12px_rgba(14,165,233,0.12)]"
                        : "border border-transparent hover:border-slate-200/80 dark:hover:border-white/10 hover:bg-white/40 dark:hover:bg-white/[0.03]"
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {canManageProcesses && (
                          <GripVertical
                            className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-hidden="true"
                          />
                        )}
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
                          className="flex items-center justify-center w-7 h-7 text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer"
                          title="Edit process"
                          aria-label={`Edit ${process.name}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setProcessToDelete(process)}
                          className="flex items-center justify-center w-7 h-7 text-rose-500 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Delete process"
                          aria-label={`Delete ${process.name}`}
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
          <div className="flex-1 min-w-0 glass-card rounded-[22px] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                {loadingProcesses ? (
                  <div className="space-y-2 animate-pulse" aria-hidden="true">
                    <div className="h-5 w-52 bg-slate-200 dark:bg-white/10 rounded" />
                    <div className="h-3 w-36 bg-slate-100 dark:bg-white/5 rounded" />
                  </div>
                ) : (
                  <>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {selectedProcess ? `Screens in ${selectedProcess.name}` : "Screens"}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {screens.length} {screens.length === 1 ? "screen" : "screens"}
                    </p>
                  </>
                )}
              </div>
              {selectedProcess && (
                <div className="flex flex-wrap items-center gap-2">
                  {mode === undefined && (
                    <>
                      <button
                        onClick={() => {
                          setEditingProcess(selectedProcess);
                          setProcessModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit Process
                      </button>
                      <button
                        onClick={() => setProcessToDelete(selectedProcess)}
                        className="flex items-center justify-center w-8 h-8 text-rose-500 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        title="Delete process"
                        aria-label={`Delete ${selectedProcess.name}`}
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
                  {loadingProcesses ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-48 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse" />
                      <div className="h-8 w-20 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse" />
                    </div>
                  ) : (
                    <TableToolbar
                      query={table.query}
                      onQueryChange={table.setQuery}
                      onExport={handleExport}
                      exportDisabled={table.filtered.length === 0}
                      placeholder="Search screens..."
                    />
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide border-b border-slate-100 dark:border-white/[0.06]">
                        {loadingProcesses ? (
                          <th className="px-6 py-3" colSpan={5}>
                            <div className="h-3 w-full max-w-md bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
                          </th>
                        ) : (
                          <>
                            <th className="px-6 py-3">Screen</th>
                            <th className="px-6 py-3">Route</th>
                            <th className="px-6 py-3">Order</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </>
                        )}
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
                          <td colSpan={5}>
                            {screens.length === 0 ? (
                              <EmptyState icon={Cog} title="No screens yet" description="Add the first screen in this process with Add Screen." />
                            ) : (
                              <EmptyState compact icon={Search} title="No matching screens" description="Try a different name or route." />
                            )}
                          </td>
                        </tr>
                      ) : (
                        table.paged.map((screen) => {
                          // Drag-reordering needs the full, unfiltered, single-page list to make sense
                          // (dragging a filtered or paginated row would reorder against rows not on screen).
                          const canDrag = table.query === "" && table.totalPages <= 1;
                          return (
                          <tr
                            key={screen.id}
                            className={`hover:bg-white/35 dark:hover:bg-white/[0.02] transition-colors ${dragOverScreenId === screen.id ? "bg-sky-50/60 dark:bg-sky-500/10" : ""} ${draggedScreenId === screen.id ? "opacity-40" : ""}`}
                            draggable={canDrag}
                            onDragStart={() => canDrag && setDraggedScreenId(screen.id)}
                            onDragEnd={() => {
                              setDraggedScreenId(null);
                              setDragOverScreenId(null);
                            }}
                            onDragOver={(e) => {
                              if (!canDrag || draggedScreenId == null) return;
                              e.preventDefault();
                              if (dragOverScreenId !== screen.id) setDragOverScreenId(screen.id);
                            }}
                            onDrop={(e) => {
                              if (!canDrag) return;
                              e.preventDefault();
                              dropScreen(screen.id);
                            }}
                          >
                            <td className="px-6 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-2.5">
                                {canDrag && (
                                  <GripVertical className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 cursor-grab" aria-hidden="true" />
                                )}
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
                                  className="flex items-center justify-center w-7 h-7 text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
                                  title="Edit screen"
                                  aria-label={`Edit ${screen.name}`}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setScreenToDelete(screen)}
                                  className="flex items-center justify-center w-7 h-7 text-rose-500 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                  title="Delete screen"
                                  aria-label={`Delete ${screen.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })
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

      {processToDelete && (
        <ConfirmDialog
          title="Delete process?"
          message={
            <>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{processToDelete.name}</span> will be removed.
              Its screens won't show in the sidebar until they're moved to another process.
            </>
          }
          onConfirm={handleDeleteProcessConfirm}
          onCancel={() => setProcessToDelete(null)}
        />
      )}

      {screenToDelete && (
        <ConfirmDialog
          title="Delete screen?"
          message={
            <>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{screenToDelete.name}</span>{" "}
              <span className="font-mono">({screenToDelete.url})</span> will be removed from every role. This can't be undone.
            </>
          }
          onConfirm={handleDeleteScreenConfirm}
          onCancel={() => setScreenToDelete(null)}
        />
      )}
    </PageContainer>
  );
}
