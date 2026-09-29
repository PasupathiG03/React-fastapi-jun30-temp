
import { useEffect, useState } from "react";
import { Plus, Trash2, X, Edit2, Cog, Layers } from "lucide-react";
import { createPortal } from "react-dom";
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

// ── Add/Edit Process Modal ──────────────────────────────────────────────

interface ProcessModalProps {
  editing: ProcessItem | null;
  onClose: () => void;
  onSaved: (process: ProcessItem) => void;
}

function ProcessModal({ editing, onClose, onSaved }: ProcessModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [codeEdited, setCodeEdited] = useState(!!editing);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!codeEdited) setCode(name ? toSlug(name) : "");
  }, [name, codeEdited]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Process Name is required");
    if (!code.trim()) return setError("Code is required");

    setSubmitting(true);
    try {
      const payload: ProcessCreatePayload = {
        name: name.trim(),
        code: code.trim(),
        description: description.trim() || null,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-lg overflow-visible">
        <div
          className="px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl"
          style={{ background: "linear-gradient(135deg, rgba(29,85,232,0.06), rgba(18,53,176,0.04))" }}
        >
          <div className="flex items-center gap-2">
            {editing ? <Edit2 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
            <h2 className="text-sm font-semibold text-gray-800">{editing ? "Edit Process" : "Add Process"}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Process Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter process name"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeEdited(true);
                  }}
                  placeholder="Enter code"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
                <p className="text-xs text-gray-400">A stable, short identifier — letters, numbers, and hyphens.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">Description</label>
              <input
                type="text"
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2">
              <Toggle checked={isActive} onChange={setIsActive} />
              <span className="text-sm text-gray-700">Active</span>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 shadow-sm hover:shadow-md hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
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
  editing: MenuItem | null;
  onClose: () => void;
  onSaved: (menu: MenuItem) => void;
}

function ScreenModal({ processId, editing, onClose, onSaved }: ScreenModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [route, setRoute] = useState(editing?.url ?? "");
  const [routeEdited, setRouteEdited] = useState(!!editing);
  const [group, setGroup] = useState(editing?.group ?? "");
  const [order, setOrder] = useState(editing?.order ?? 0);
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
        group: group.trim() || null,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-xl overflow-visible">
        <div
          className="px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl"
          style={{ background: "linear-gradient(135deg, rgba(29,85,232,0.06), rgba(18,53,176,0.04))" }}
        >
          <div className="flex items-center gap-2">
            {editing ? <Edit2 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
            <h2 className="text-sm font-semibold text-gray-800">{editing ? "Edit Screen" : "Add Screen"}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Screen Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Leave Approval"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Route <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={route}
                  onChange={(e) => {
                    setRoute(e.target.value);
                    setRouteEdited(true);
                  }}
                  placeholder="e.g. /hostel/leave-approval"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">Menu Group</label>
                <input
                  type="text"
                  value={group ?? ""}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="e.g. Reports (optional)"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">Order</label>
                <input
                  type="number"
                  value={order}
                  min={0}
                  onChange={(e) => setOrder(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Toggle checked={isActive} onChange={setIsActive} />
              <span className="text-sm text-gray-700">Active</span>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 shadow-sm hover:shadow-md hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
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

export default function MenuManagementPage() {
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
      return next.sort((a, b) => a.name.localeCompare(b.name));
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

  const selectedProcess = processes.find((p) => p.id === selectedProcessId) ?? null;

  return (
    <div className="p-6 w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
          >
            <Cog className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Menu Management</h1>
            <p className="text-sm text-gray-500">Organize sidebar navigation into processes and screens</p>
          </div>
        </div>
      </div>

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

      <div className="flex gap-6 items-start">
        {/* ── Processes panel ── */}
        <div className="w-72 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Processes</h2>
            <button
              onClick={() => {
                setEditingProcess(null);
                setProcessModalOpen(true);
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
              title="Add process"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="divide-y divide-gray-50">
            {loadingProcesses ? (
              <div className="p-4 space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-xl" />
                ))}
              </div>
            ) : processes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 px-4">
                <Layers className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm text-center">No processes yet</p>
              </div>
            ) : (
              processes.map((process) => {
                const active = process.id === selectedProcessId;
                return (
                  <button
                    key={process.id}
                    onClick={() => setSelectedProcessId(process.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      active ? "text-white" : "hover:bg-gray-50 text-gray-800"
                    }`}
                    style={active ? { background: "linear-gradient(135deg, #1d55e8, #1235b0)" } : undefined}
                  >
                    <p className="text-sm font-semibold truncate">{process.name}</p>
                    <p className={`text-xs font-mono mt-0.5 truncate ${active ? "text-white/80" : "text-gray-400"}`}>
                      {process.code}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Screens panel ── */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {selectedProcess ? `Screens in ${selectedProcess.name}` : "Screens"}
              </h2>
              <p className="text-sm text-gray-500">{selectedProcess?.description || "No description."}</p>
            </div>
            {selectedProcess && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setEditingProcess(selectedProcess);
                    setProcessModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit Process
                </button>
                <button
                  onClick={() => setProcessToDelete(selectedProcess)}
                  className="flex items-center justify-center w-9 h-9 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  title="Delete process"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingScreen(null);
                    setScreenModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:shadow-md hover:opacity-90 transition-all shadow-sm"
                  style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/50">
                    <th className="px-6 py-3">Screen</th>
                    <th className="px-6 py-3">Route</th>
                    <th className="px-6 py-3">Group</th>
                    <th className="px-6 py-3">Order</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loadingScreens || loadingProcesses ? (
                    [1, 2, 3].map((i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-6 py-4" colSpan={6}>
                          <div className="h-4 bg-gray-100 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : screens.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        <Cog className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No screens yet</p>
                        <p className="text-xs mt-0.5">Add your first screen above</p>
                      </td>
                    </tr>
                  ) : (
                    screens.map((screen) => (
                      <tr key={screen.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-3.5 font-semibold text-gray-800">{screen.name}</td>
                        <td className="px-6 py-3.5 font-mono text-xs text-blue-600">{screen.url}</td>
                        <td className="px-6 py-3.5 text-gray-400">{screen.group || "—"}</td>
                        <td className="px-6 py-3.5 text-gray-500">{screen.order}</td>
                        <td className="px-6 py-3.5">
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                              screen.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {screen.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingScreen(screen);
                                setScreenModalOpen(true);
                              }}
                              className="flex items-center justify-center w-8 h-8 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                              title="Edit screen"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setScreenToDelete(screen)}
                              className="flex items-center justify-center w-8 h-8 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
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
          )}
        </div>
      </div>

      {/* Process modal */}
      {processModalOpen && (
        <ProcessModal
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
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setProcessToDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Process?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete <span className="font-semibold text-gray-800">{processToDelete.name}</span>?
                Its screens won't be shown until reassigned to another process.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setProcessToDelete(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProcessConfirm}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
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
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setScreenToDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Screen?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to permanently delete <span className="font-semibold text-gray-800">{screenToDelete.name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setScreenToDelete(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteScreenConfirm}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
