import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Edit2,
  MoreVertical,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { CustomSelect } from "@/components/CustomSelect";
import { getStageIcon } from "@/lib/stageIcons";
import {
  createStage,
  createWorkflow,
  deleteStage,
  deleteWorkflow,
  fetchWorkflow,
  fetchWorkflows,
  updateStage,
  updateWorkflow,
  type StageItem,
  type StageType,
  type WorkflowDetail,
  type WorkflowItem,
} from "@/services/workflow";


const STAGE_TYPE_OPTIONS: { value: StageType; label: string }[] = [
  { value: "production", label: "Production" },
  { value: "qc", label: "Quality Control (QC)" },
  { value: "qa", label: "Quality Assurance (QA)" },
];

// ── Confirm Dialog Modal ─────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Delete",
  danger = true,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  danger?: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 space-y-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{message}</p>
        </div>
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-xl text-white transition-all shadow-sm cursor-pointer ${
              danger
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                : "bg-sky-500 hover:bg-sky-400 shadow-sky-500/30"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Add/Edit Workflow Modal ──────────────────────────────────────────────

function WorkflowFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: WorkflowItem | null;
  onClose: () => void;
  onSaved: (workflow: WorkflowItem) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (!trimmed) return setError("Workflow name is required");

    setSubmitting(true);
    try {
      if (editing) {
        const updated = await updateWorkflow(editing.id, { name: trimmed });
        onSaved(updated);
      } else {
        const created = await createWorkflow(trimmed);
        onSaved(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workflow");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {editing ? "Rename Workflow" : "New Workflow"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                Workflow Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Review Workflow"
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
              />
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
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-sm transition-all disabled:opacity-60 cursor-pointer"
            >
              {submitting ? "Saving..." : editing ? "Save Changes" : "Create Workflow"}
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
  workflowName,
  nextOrder,
  editing,
  onClose,
  onSaved,
}: {
  workflowName: string;
  nextOrder: number;
  editing: StageItem | null;
  onClose: () => void;
  onSaved: (payload: { name: string; stage_type: StageType; sequence_order: number }) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [stageType, setStageType] = useState<StageType>(editing?.stage_type ?? "production");
  const [sequenceOrder, setSequenceOrder] = useState<number>(editing?.sequence_order ?? nextOrder);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (!trimmed) return setError("Stage name is required");

    setSubmitting(true);
    try {
      await onSaved({
        name: trimmed,
        stage_type: stageType,
        sequence_order: Number(sequenceOrder) || nextOrder,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save stage");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {editing ? `Edit Stage: ${editing.name}` : "Add New Stage"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Workflow: <span className="font-semibold text-slate-700 dark:text-slate-200">{workflowName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Stage Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Client Review"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Stage Type
                </label>
                <CustomSelect<StageType>
                  value={stageType}
                  onChange={(val) => setStageType(val)}
                  options={STAGE_TYPE_OPTIONS}
                  className="w-full"
                  size="md"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                Sequence Order
              </label>
              <input
                type="number"
                value={sequenceOrder}
                onChange={(e) => setSequenceOrder(Number(e.target.value))}
                min={1}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Stages execute sequentially in order (1, 2, 3...).
              </p>
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
              className="px-5 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-sm transition-all disabled:opacity-60 cursor-pointer"
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

// ── Create Workflow Wizard (Name → Add Stages) ───────────────────────────

function CreateWorkflowWizardModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (workflow: WorkflowDetail) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
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
    if (workflow) {
      onDone({
        ...workflow,
        stages: addedStages,
      });
    } else {
      onClose();
    }
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Workflow name is required");
    setSubmitting(true);
    try {
      const w = await createWorkflow(name.trim());
      const full = await fetchWorkflow(w.id);
      setWorkflow(full);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddStageDirect(e: React.FormEvent) {
    e.preventDefault();
    if (!workflow) return;
    setStageError("");
    const trimmed = stageName.trim();
    if (!trimmed) return setStageError("Stage name is required");

    setStageSubmitting(true);
    try {
      const s = await createStage(workflow.id, {
        name: trimmed,
        stage_type: stageType,
        sequence_order: nextOrder,
      });
      setAddedStages((prev) => [...prev, s]);
      setStageName("");
      setStageType("production");
    } catch (err) {
      setStageError(err instanceof Error ? err.message : "Failed to add stage");
    } finally {
      setStageSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Wizard Header with Steps */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span
              className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                step === 1
                  ? "bg-sky-500 text-white shadow-sm"
                  : "bg-emerald-500 text-white"
              }`}
            >
              {step === 1 ? "1" : "✓"}
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {step === 1 ? "Step 1: Workflow Details" : "Step 2: Add Workflow Stages"}
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {step === 1
                  ? "Give your workflow a name to start"
                  : `Add initial stages to "${workflow?.name}"`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAndSync}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Step 1: Workflow Name */}
        {step === 1 && (
          <form onSubmit={handleNext}>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Workflow Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Standard Review Workflow"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                />
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
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-sm transition-all disabled:opacity-60 cursor-pointer"
              >
                {submitting ? "Creating..." : "Next: Add Stages →"}
              </button>
            </div>
          </form>
        )}

        {/* Wizard Step 2: Add Stages */}
        {step === 2 && (
          <div className="flex flex-col">
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Existing stages preview */}
              {addedStages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Stages Added ({addedStages.length})
                  </p>
                  <div className="space-y-2">
                    {addedStages.map((stage) => {
                      const Icon = getStageIcon(stage.stage_type);
                      return (
                        <div
                          key={stage.id}
                          className="flex items-center gap-3 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-200/80 dark:border-white/[0.06] px-3.5 py-2.5"
                        >
                          <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-bold flex items-center justify-center shrink-0">
                            {stage.sequence_order}
                          </span>
                          <span className="w-6 h-6 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <span className="flex-1 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {stage.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Form to add another stage */}
              <form onSubmit={handleAddStageDirect} className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Add Next Stage
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                      Stage Name
                    </label>
                    <input
                      type="text"
                      value={stageName}
                      onChange={(e) => setStageName(e.target.value)}
                      placeholder="e.g. Client Review"
                      autoFocus
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                      Stage Type
                    </label>
                    <CustomSelect<StageType>
                      value={stageType}
                      onChange={(val) => setStageType(val)}
                      options={STAGE_TYPE_OPTIONS}
                      className="w-full"
                      size="md"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                    Sequence Order
                  </label>
                  <input
                    type="number"
                    value={nextOrder}
                    disabled
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  />
                </div>

                {stageError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {stageError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={stageSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-sky-600 dark:text-sky-400 border border-sky-300 dark:border-sky-500/30 bg-sky-50/50 dark:bg-sky-500/10 hover:bg-sky-100/70 dark:hover:bg-sky-500/20 transition-all disabled:opacity-60 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {stageSubmitting ? "Adding..." : "Add This Stage"}
                </button>
              </form>
            </div>

            <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-between rounded-b-2xl">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {addedStages.length} {addedStages.length === 1 ? "stage" : "stages"} created
              </span>
              <button
                type="button"
                onClick={closeAndSync}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-sm transition-all cursor-pointer"
              >
                Finish & View Workflow
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function WorkflowManagementPage() {
  const [workflows, setWorkflows] = useState<WorkflowDetail[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const [stageModal, setStageModal] = useState<{
    workflow: WorkflowDetail;
    editing: StageItem | null;
  } | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowItem | null>(null);
  const [stageToDelete, setStageToDelete] = useState<{
    workflow: WorkflowDetail;
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
      // silently fail
    } finally {
      setLoadingWorkflows(false);
    }
  }

  function handleWorkflowSaved(w: WorkflowItem) {
    setWorkflows((prev) => prev.map((wf) => (wf.id === w.id ? { ...wf, name: w.name, is_active: w.is_active } : wf)));
    setEditingWorkflow(null);
    flash(`Workflow "${w.name}" saved`);
  }

  async function handleWorkflowCreated(w: WorkflowDetail) {
    setCreateModalOpen(false);
    flash(`Workflow "${w.name}" created`);
    try {
      const full = await fetchWorkflow(w.id);
      setWorkflows((prev) => (prev.some((p) => p.id === full.id) ? prev.map((p) => p.id === full.id ? full : p) : [...prev, full]));
    } catch {
      setWorkflows((prev) => [...prev, w]);
    }
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

  function handleAddStageClick(w: WorkflowDetail) {
    setStageModal({ workflow: w, editing: null });
  }

  async function handleStageSaved(payload: { name: string; stage_type: StageType; sequence_order: number }) {
    if (!stageModal) return;
    const { workflow, editing } = stageModal;
    const saved = editing
      ? await updateStage(workflow.id, editing.id, payload)
      : await createStage(workflow.id, payload);

    setWorkflows((prev) =>
      prev.map((w) =>
        w.id !== workflow.id
          ? w
          : {
              ...w,
              stages: editing
                ? w.stages.map((s) => (s.id === saved.id ? saved : s))
                : [...w.stages, saved].sort((a, b) => a.sequence_order - b.sequence_order),
            }
      )
    );
    setStageModal(null);
    flash(editing ? "Stage updated successfully" : "Stage added successfully");
  }

  async function handleDeleteStageConfirm() {
    if (!stageToDelete) return;
    const { workflow, stage } = stageToDelete;
    try {
      await deleteStage(workflow.id, stage.id);
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id !== workflow.id
            ? w
            : { ...w, stages: w.stages.filter((s) => s.id !== stage.id) }
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
    <PageContainer>
      <PageHeader
        icon={WorkflowIcon}
        title="Workflow Management"
        subtitle="Define and manage approval workflows and stages"
        actions={
          <button
            onClick={() => setCreateModalOpen(true)}
            className="group relative flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create Workflow
          </button>
        }
      />

      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-400 shadow-sm">
          ✓ {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400 shadow-sm">
          {error}
        </div>
      )}

      {loadingWorkflows ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#0c1427]/70 backdrop-blur-xl rounded-[22px] border border-slate-200/80 dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] p-5 space-y-4 animate-pulse"
            >
              {/* Card Header Skeleton */}
              <div className="flex items-center gap-3">
                <div
                  className="h-4.5 bg-slate-200 dark:bg-white/10 rounded-md"
                  style={{ width: `${38 + ((i * 15) % 25)}%` }}
                />
                <div className="h-5 w-16 bg-slate-100 dark:bg-white/5 rounded-full shrink-0" />
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 shrink-0 ml-auto" />
              </div>

              {/* Stages List Skeleton */}
              <div className="space-y-2.5">
                {[1, 2].map((s) => (
                  <div
                    key={s}
                    className="relative flex items-center gap-2.5 bg-slate-50/70 dark:bg-white/[0.02] rounded-xl border border-slate-200/80 dark:border-white/[0.06] pl-4 pr-2.5 py-2.5 overflow-hidden"
                  >
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-slate-200 dark:bg-white/10" />
                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-white/10 shrink-0" />
                    <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10 shrink-0" />
                    <div
                      className="h-3.5 bg-slate-200 dark:bg-white/10 rounded-md flex-1"
                      style={{ maxWidth: `${45 + ((s * 25) % 35)}%` }}
                    />
                    <div className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-white/5 shrink-0" />
                  </div>
                ))}

                {/* Add Stage dashed placeholder */}
                <div className="w-full h-11 rounded-xl border-2 border-dashed border-slate-200/80 dark:border-white/[0.08] bg-slate-50/30 dark:bg-white/[0.01] flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="h-3 w-20 bg-slate-200 dark:bg-white/10 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="bg-white dark:bg-[#0c1427]/70 backdrop-blur-xl rounded-[22px] border border-slate-200/80 dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)] p-12 flex flex-col items-center justify-center text-center gap-2">
          <WorkflowIcon className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No workflows yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Create one to start defining stages.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workflows.map((w) => (
            <div
              key={w.id}
              className="bg-white dark:bg-[#0c1427]/70 backdrop-blur-xl rounded-[22px] border border-slate-200/80 dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] p-5 space-y-4 hover:border-sky-500/40 transition-colors"
            >
              {/* Card Header */}
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{w.name}</h2>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    w.is_active
                      ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                      : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {w.is_active ? "● Active" : "Inactive"}
                </span>

                <div className="relative ml-auto">
                  <button
                    onClick={() => setOpenMenuId((prev) => (prev === w.id ? null : w.id))}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {openMenuId === w.id && (
                    <div className="absolute right-0 top-9 w-44 bg-white dark:bg-[#0c1427] rounded-xl border border-slate-200 dark:border-white/10 shadow-xl py-1.5 z-20">
                      <button
                        onClick={() => {
                          setEditingWorkflow(w);
                          setOpenMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Rename
                      </button>
                      <button
                        onClick={() => handleToggleActive(w)}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                      >
                        <WorkflowIcon className="w-3.5 h-3.5" />
                        {w.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => {
                          setWorkflowToDelete(w);
                          setOpenMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Stages Section ── */}
              {w.stages.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400 dark:text-slate-500">No stages yet.</p>
                  <button
                    onClick={() => handleAddStageClick(w)}
                    className="w-full flex flex-col items-center justify-center gap-1 py-4 rounded-xl border-2 border-dashed border-sky-300/60 dark:border-sky-500/30 bg-sky-50/40 dark:bg-sky-500/5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Plus className="w-3.5 h-3.5" /> Add Stage
                    </span>
                    <span className="text-[11px] text-sky-500/70 dark:text-sky-400/60">Create the first workflow stage</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {w.stages.map((stage) => {
                    const Icon = getStageIcon(stage.stage_type);
                    return (
                      <div
                        key={stage.id}
                        className="group relative flex items-center gap-2.5 bg-slate-50/70 dark:bg-white/[0.03] hover:bg-slate-100/70 dark:hover:bg-white/[0.06] rounded-xl border border-slate-200/80 dark:border-white/[0.06] pl-4 pr-2.5 py-2.5 overflow-hidden transition-colors"
                      >
                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00c6ff] to-[#0072ff]" />
                        <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-bold flex items-center justify-center shrink-0">
                          {stage.sequence_order}
                        </span>
                        <span className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <button
                          onClick={() => setStageModal({ workflow: w, editing: stage })}
                          className="flex-1 text-left text-xs font-semibold text-slate-800 dark:text-slate-200 truncate hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
                        >
                          {stage.name}
                        </button>
                        <button
                          onClick={() => setStageModal({ workflow: w, editing: stage })}
                          title="Edit stage"
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 shrink-0 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setStageToDelete({ workflow: w, stage })}
                          title="Delete stage"
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => handleAddStageClick(w)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-sky-300/60 dark:border-sky-500/30 bg-sky-50/40 dark:bg-sky-500/5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Stage
                  </button>
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
          workflowName={stageModal.workflow.name}
          nextOrder={stageModal.workflow.stages.length + 1}
          editing={stageModal.editing}
          onClose={() => setStageModal(null)}
          onSaved={handleStageSaved}
        />
      )}

      {workflowToDelete && (
        <ConfirmDialog
          title="Delete Workflow?"
          message={`Are you sure you want to delete "${workflowToDelete.name}"? This will remove all its stages.`}
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
    </PageContainer>
  );
}
