import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Edit2, MoreVertical, Plus, Trash2, Workflow as WorkflowIcon, X } from "lucide-react";
import {
  createWorkflow,
  deleteWorkflow,
  fetchWorkflows,
  updateWorkflow,
  type WorkflowItem,
} from "@/services/workflow";

const BRAND_GRADIENT = "linear-gradient(135deg, #1d55e8, #1235b0)";

// ── Create/Rename Workflow Modal ────────────────────────────────────────

function WorkflowFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: WorkflowItem | null;
  onClose: () => void;
  onSaved: (w: WorkflowItem) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Workflow name is required");
    setSubmitting(true);
    try {
      const saved = editing
        ? await updateWorkflow(editing.id, { name: name.trim() })
        : await createWorkflow(name.trim());
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workflow");
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
            <h2 className="text-sm font-semibold text-gray-800">
              {editing ? "Rename Workflow" : "Create New Workflow"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 space-y-1.5">
            <label className="text-xs font-semibold text-gray-600">
              Workflow Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fast Track Process"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 mt-2 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
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
              style={{ background: BRAND_GRADIENT }}
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


// ── Confirm delete ───────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── Main Page ─────────────────────────────────────────────────────────────

export default function WorkflowManagementPage() {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowItem | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadWorkflows();
  }, []);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 2500);
  }

  async function loadWorkflows() {
    try {
      const data = await fetchWorkflows();
      setWorkflows(data);
    } catch {
      // silently fail — non-superusers still get the list (read is open to any authed user)
    } finally {
      setLoadingWorkflows(false);
    }
  }

  function handleWorkflowSaved(w: WorkflowItem) {
    setWorkflows((prev) => prev.map((wf) => (wf.id === w.id ? { ...wf, name: w.name, is_active: w.is_active } : wf)));
    setEditingWorkflow(null);
    flash(`Workflow "${w.name}" saved`);
  }

  function handleWorkflowCreated(w: WorkflowItem) {
    setWorkflows((prev) => (prev.some((p) => p.id === w.id) ? prev : [...prev, w]));
    setCreateModalOpen(false);
    flash(`Workflow "${w.name}" created`);
  }

  async function handleToggleActive(workflow: WorkflowItem) {
    try {
      const updated = await updateWorkflow(workflow.id, { is_active: !workflow.is_active });
      setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? { ...w, is_active: updated.is_active } : w)));
      setOpenMenuId(null);
    } catch {
      setError("Failed to update workflow status");
    }
  }

  async function handleDeleteWorkflowConfirm() {
    if (!workflowToDelete) return;
    try {
      await deleteWorkflow(workflowToDelete.id);
      setWorkflows((prev) => prev.filter((w) => w.id !== workflowToDelete.id));
      flash("Workflow deleted successfully");
    } catch {
      setError("Failed to delete workflow");
    } finally {
      setWorkflowToDelete(null);
    }
  }

  return (
    <div className="p-6 w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: BRAND_GRADIENT }}
          >
            <WorkflowIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Workflow Management</h1>
            <p className="text-sm text-gray-500">Define and manage approval workflows</p>
          </div>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-sm hover:shadow-md hover:opacity-90"
          style={{ background: BRAND_GRADIENT }}
        >
          <Plus className="w-4 h-4" /> Create Workflow
        </button>
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

      {loadingWorkflows ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-white rounded-2xl border border-gray-100 shadow-sm animate-pulse" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex flex-col items-center justify-center text-center gap-2">
          <WorkflowIcon className="w-10 h-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">No workflows yet</p>
          <p className="text-xs text-gray-400">Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workflows.map((w) => (
            <div key={w.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-gray-900 truncate">{w.name}</h2>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                    w.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {w.is_active ? "● Active" : "Inactive"}
                </span>

                <div className="relative ml-auto">
                  <button
                    onClick={() => setOpenMenuId((prev) => (prev === w.id ? null : w.id))}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {openMenuId === w.id && (
                    <div className="absolute right-0 top-10 w-44 bg-white rounded-xl border border-gray-100 shadow-lg py-1.5 z-20">
                      <button
                        onClick={() => {
                          setEditingWorkflow(w);
                          setOpenMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Edit2 className="w-4 h-4" /> Rename
                      </button>
                      <button
                        onClick={() => handleToggleActive(w)}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <WorkflowIcon className="w-4 h-4" />
                        {w.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => {
                          setWorkflowToDelete(w);
                          setOpenMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {createModalOpen && (
        <WorkflowFormModal
          editing={null}
          onClose={() => setCreateModalOpen(false)}
          onSaved={handleWorkflowCreated}
        />
      )}

      {editingWorkflow && (
        <WorkflowFormModal
          editing={editingWorkflow}
          onClose={() => setEditingWorkflow(null)}
          onSaved={handleWorkflowSaved}
        />
      )}

      {workflowToDelete && (
        <ConfirmDialog
          title="Delete Workflow?"
          message={`Are you sure you want to delete "${workflowToDelete.name}"?`}
          onCancel={() => setWorkflowToDelete(null)}
          onConfirm={handleDeleteWorkflowConfirm}
        />
      )}
    </div>
  );
}
