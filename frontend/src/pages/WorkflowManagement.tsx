
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Edit2,
  LayoutGrid,
  MoreVertical,
  Plus,
  ShieldCheck,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import {
  createLevel,
  createStage,
  createWorkflow,
  deleteStage,
  deleteWorkflow,
  fetchWorkflow,
  fetchWorkflows,
  updateStage,
  updateWorkflow,
  type LevelItem,
  type StageItem,
  type StageType,
  type WorkflowDetail,
  type WorkflowItem,
} from "@/services/workflow";

const STAGE_TYPE_LABEL: Record<StageType, string> = {
  production: "Production",
  qc: "Quality Control (QC)",
  qa: "Quality Assurance (QA)",
};

const STAGE_TYPE_ICON: Record<StageType, React.ElementType> = {
  production: LayoutGrid,
  qc: ShieldCheck,
  qa: CheckCircle2,
};

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

// ── Add/Edit Stage Modal ─────────────────────────────────────────────────

function StageFormModal({
  levelOrder,
  nextOrder,
  editing,
  onClose,
  onSaved,
}: {
  levelOrder: number;
  nextOrder: number;
  editing: StageItem | null;
  onClose: () => void;
  onSaved: (payload: { name: string; stage_type: StageType; sequence_order: number }) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [stageType, setStageType] = useState<StageType>(editing?.stage_type ?? "production");
  const sequenceOrder = editing ? editing.sequence_order : nextOrder;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Stage name is required");

    setSubmitting(true);
    try {
      await onSaved({ name: name.trim(), stage_type: stageType, sequence_order: sequenceOrder });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save stage");
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
            <h2 className="text-sm font-semibold text-gray-800">
              {editing ? "Edit Stage" : `Add Stage to ${levelOrder} Level`}
            </h2>
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
                  Stage Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Client Review"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">Stage Type</label>
                <select
                  value={stageType}
                  onChange={(e) => setStageType(e.target.value as StageType)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                >
                  <option value="production">Production</option>
                  <option value="qc">Quality Control (QC)</option>
                  <option value="qa">Quality Assurance (QA)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">Sequence Order</label>
              <input
                type="number"
                value={sequenceOrder}
                readOnly
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-500 bg-gray-50 cursor-not-allowed focus:outline-none"
              />
              <p className="text-xs text-gray-400">Auto-assigned based on position — determines the flow of the process.</p>
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
              style={{ background: BRAND_GRADIENT }}
            >
              {editing ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {submitting ? "Saving..." : editing ? "Save Changes" : "Add Stage"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Create Workflow wizard (one modal: name → add stages) ───────────────

function CreateWorkflowWizardModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (workflow: WorkflowItem) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [workflow, setWorkflow] = useState<WorkflowItem | null>(null);
  const [level, setLevel] = useState<LevelItem | null>(null);
  const [addedStages, setAddedStages] = useState<StageItem[]>([]);

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [stageName, setStageName] = useState("");
  const [stageType, setStageType] = useState<StageType>("production");
  const nextOrder = addedStages.length + 1;
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const [stageError, setStageError] = useState("");

  function closeAndSync() {
    if (workflow) onDone(workflow);
    else onClose();
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Workflow name is required");
    setSubmitting(true);
    try {
      const w = await createWorkflow(name.trim());
      const lvl = await createLevel(w.id);
      setWorkflow(w);
      setLevel({ ...lvl, stages: [] });
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddStage(e: React.FormEvent) {
    e.preventDefault();
    setStageError("");
    if (!workflow || !level) return;
    if (!stageName.trim()) return setStageError("Stage name is required");

    setStageSubmitting(true);
    try {
      const stage = await createStage(workflow.id, level.id, {
        name: stageName.trim(),
        stage_type: stageType,
        sequence_order: nextOrder,
      });
      setAddedStages((prev) => [...prev, stage].sort((a, b) => a.sequence_order - b.sequence_order));
      setStageName("");
      setStageType("production");
    } catch (err) {
      setStageError(err instanceof Error ? err.message : "Failed to add stage");
    } finally {
      setStageSubmitting(false);
    }
  }

  async function handleRemoveStage(stage: StageItem) {
    if (!workflow || !level) return;
    try {
      await deleteStage(workflow.id, level.id, stage.id);
      setAddedStages((prev) => prev.filter((s) => s.id !== stage.id));
    } catch {
      setStageError("Failed to remove stage");
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
            <Plus className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">
              {step === 1 ? "Create New Workflow" : `Add Stage to ${level?.order ?? 1} Level`}
            </h2>
          </div>
          <button type="button" onClick={closeAndSync} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 1 ? (
          <form onSubmit={handleNext} className="flex flex-col">
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
                {submitting ? "Creating..." : "Next"}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAddStage} className="flex flex-col">
            <div className="p-6 space-y-5">
              {addedStages.length > 0 && (
                <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                  {addedStages.map((stage) => (
                    <div key={stage.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="text-xs font-mono text-gray-400 w-5 shrink-0">{stage.sequence_order}</span>
                      <span className="text-sm text-gray-800 flex-1 truncate">{stage.name}</span>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700 shrink-0">
                        {STAGE_TYPE_LABEL[stage.stage_type]}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveStage(stage)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Stage Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    placeholder="e.g. Client Review"
                    autoFocus
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Stage Type</label>
                  <select
                    value={stageType}
                    onChange={(e) => setStageType(e.target.value as StageType)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  >
                    <option value="production">Production</option>
                    <option value="qc">Quality Control (QC)</option>
                    <option value="qa">Quality Assurance (QA)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">Sequence Order</label>
                <input
                  type="number"
                  value={nextOrder}
                  readOnly
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-500 bg-gray-50 cursor-not-allowed focus:outline-none"
                />
                <p className="text-xs text-gray-400">Auto-assigned based on position — determines the flow of the process.</p>
              </div>

              {stageError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
                  {stageError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={closeAndSync}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                Finish
              </button>
              <button
                type="submit"
                disabled={stageSubmitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 shadow-sm hover:shadow-md hover:opacity-90"
                style={{ background: BRAND_GRADIENT }}
              >
                <Plus className="w-4 h-4" />
                {stageSubmitting ? "Adding..." : "Add Stage"}
              </button>
            </div>
          </form>
        )}
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
  const [workflows, setWorkflows] = useState<WorkflowDetail[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const [stageModal, setStageModal] = useState<{
    workflow: WorkflowDetail;
    level: LevelItem;
    editing: StageItem | null;
  } | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowItem | null>(null);
  const [stageToDelete, setStageToDelete] = useState<{
    workflow: WorkflowDetail;
    level: LevelItem;
    stage: StageItem;
  } | null>(null);

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

  async function handleWorkflowCreated(w: WorkflowItem) {
    setCreateModalOpen(false);
    flash(`Workflow "${w.name}" created`);
    try {
      const full = await fetchWorkflow(w.id);
      setWorkflows((prev) => (prev.some((p) => p.id === full.id) ? prev : [...prev, full]));
    } catch {
      setError("Workflow created, but failed to load its stages — refresh to see them.");
    }
  }

  async function handleToggleActive(workflow: WorkflowDetail) {
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

  async function handleStageSaved(payload: { name: string; stage_type: StageType; sequence_order: number }) {
    if (!stageModal) return;
    const { workflow, level, editing } = stageModal;
    const saved = editing
      ? await updateStage(workflow.id, level.id, editing.id, payload)
      : await createStage(workflow.id, level.id, payload);

    setWorkflows((prev) =>
      prev.map((w) =>
        w.id !== workflow.id
          ? w
          : {
              ...w,
              levels: w.levels.map((l) =>
                l.id !== level.id
                  ? l
                  : {
                      ...l,
                      stages: editing
                        ? l.stages.map((s) => (s.id === saved.id ? saved : s))
                        : [...l.stages, saved].sort((a, b) => a.sequence_order - b.sequence_order),
                    }
              ),
            }
      )
    );
    setStageModal(null);
    flash(editing ? "Stage updated successfully" : "Stage added successfully");
  }

  async function handleDeleteStageConfirm() {
    if (!stageToDelete) return;
    const { workflow, level, stage } = stageToDelete;
    try {
      await deleteStage(workflow.id, level.id, stage.id);
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id !== workflow.id
            ? w
            : {
                ...w,
                levels: w.levels.map((l) =>
                  l.id !== level.id ? l : { ...l, stages: l.stages.filter((s) => s.id !== stage.id) }
                ),
              }
        )
      );
      flash("Stage deleted successfully");
    } catch {
      setError("Failed to delete stage");
    } finally {
      setStageToDelete(null);
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
          <p className="text-xs text-gray-400">Create one to start defining stages and approval levels.</p>
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

              {w.levels.length === 0 ? (
                <p className="text-sm text-gray-400">No levels yet.</p>
              ) : (
                <div className="space-y-3">
                  {w.levels.map((level) => (
                    <div key={level.id} className="space-y-3">
                      {level.stages.map((stage) => {
                        const Icon = STAGE_TYPE_ICON[stage.stage_type];
                        return (
                          <div
                            key={stage.id}
                            className="group relative flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm pl-5 pr-3 py-3 overflow-hidden"
                          >
                            <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600" />
                            <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold flex items-center justify-center shrink-0">
                              {stage.sequence_order}
                            </span>
                            <span className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4 text-blue-600" />
                            </span>
                            <button
                              onClick={() => setStageModal({ workflow: w, level, editing: stage })}
                              className="flex-1 text-left text-sm font-medium text-gray-800 truncate"
                            >
                              {stage.name}
                            </button>
                            <button
                              onClick={() => setStageModal({ workflow: w, level, editing: stage })}
                              title="Edit stage"
                              className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-blue-50 hover:text-blue-600 shrink-0"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setStageToDelete({ workflow: w, level, stage })}
                              title="Delete stage"
                              className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                          </div>
                        );
                      })}

                      <button
                        onClick={() => setStageModal({ workflow: w, level, editing: null })}
                        className="w-full flex flex-col items-center justify-center gap-0.5 py-5 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 text-blue-700 hover:bg-blue-50 transition-colors"
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <Plus className="w-4 h-4" /> Add Stage
                        </span>
                        <span className="text-xs text-blue-400">Create a new workflow stage</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {createModalOpen && (
        <CreateWorkflowWizardModal
          onClose={() => setCreateModalOpen(false)}
          onDone={handleWorkflowCreated}
        />
      )}

      {editingWorkflow && (
        <WorkflowFormModal
          editing={editingWorkflow}
          onClose={() => setEditingWorkflow(null)}
          onSaved={handleWorkflowSaved}
        />
      )}

      {stageModal && (
        <StageFormModal
          levelOrder={stageModal.level.order}
          nextOrder={stageModal.level.stages.length + 1}
          editing={stageModal.editing}
          onClose={() => setStageModal(null)}
          onSaved={handleStageSaved}
        />
      )}

      {workflowToDelete && (
        <ConfirmDialog
          title="Delete Workflow?"
          message={`Are you sure you want to delete "${workflowToDelete.name}"? This will remove all its levels and stages.`}
          onCancel={() => setWorkflowToDelete(null)}
          onConfirm={handleDeleteWorkflowConfirm}
        />
      )}
      {stageToDelete && (
        <ConfirmDialog
          title="Delete Stage?"
          message={`Are you sure you want to delete "${stageToDelete.stage.name}"?`}
          onCancel={() => setStageToDelete(null)}
          onConfirm={handleDeleteStageConfirm}
        />
      )}
    </div>
  );
}
