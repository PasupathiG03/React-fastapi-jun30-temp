import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, History, Inbox, ShieldAlert, X } from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { TablePagination, TableToolbar } from "@/components/DataTableControls";
import { useTableData } from "@/hooks/useTableData";
import { usePending } from "@/context/PendingContext";
import { getStageIcon } from "@/lib/stageIcons";
import {
  advanceWorkItem,
  fetchStage,
  fetchStageItems,
  fetchWorkItemHistory,
  rejectWorkItem,
  type StageAccess,
  type WorkItem,
  type WorkItemHistory,
} from "@/services/workflow";

const BRAND_GRADIENT = "linear-gradient(135deg, #00c6ff, #0072ff)";

// Short guidance under the page title, chosen by stage type so it also fits custom stage names.
const STAGE_DESCRIPTION: Record<StageAccess["stage_type"], string> = {
  production: "Work on the items in this stage, then send them forward to the next stage when they are ready.",
  qc: "Check the items sent to this stage. Send passed items forward, or send them back with a reason.",
  qa: "Review and approve the items sent to this stage. Send approved items forward, or send them back with a reason.",
};

function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function who(u?: { employee_id: string; employee_name?: string | null } | null) {
  return u ? u.employee_name || u.employee_id : "System";
}

// ── Modal shell ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors";
const labelCls = "text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide";

// ── Move an item forward / back ──────────────────────────────────────────

function MoveModal({
  item,
  mode,
  isLast,
  onClose,
  onDone,
}: {
  item: WorkItem;
  mode: "advance" | "reject";
  isLast: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const reject = mode === "reject";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reject && !comment.trim()) return setError("Please explain why you are sending it back");
    setSubmitting(true);
    setError("");
    try {
      if (reject) await rejectWorkItem(item.id, comment.trim());
      else await advanceWorkItem(item.id, comment.trim());
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move this item");
      setSubmitting(false);
    }
  }

  const heading = reject ? "Send back" : isLast ? "Complete item" : "Send to next stage";
  return (
    <Modal title={`${heading}: ${item.title}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>{reject ? "Reason (required)" : "Comment (optional)"}</label>
            <textarea className={inputCls} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
          </div>
          {error && <p className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-100 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`px-6 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-60 cursor-pointer ${reject ? "bg-rose-600 hover:bg-rose-700" : ""}`}
            style={reject ? undefined : { background: BRAND_GRADIENT }}
          >
            {submitting ? "Saving..." : heading}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── History ──────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<WorkItemHistory["action"], string> = {
  created: "Created",
  advanced: "Sent forward",
  rejected: "Sent back",
  completed: "Completed",
};

function HistoryModal({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const [rows, setRows] = useState<WorkItemHistory[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchWorkItemHistory(item.id)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load history"));
  }, [item.id]);

  return (
    <Modal title={`History: ${item.title}`} onClose={onClose}>
      <div className="p-6 max-h-[60vh] overflow-y-auto">
        {error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : rows === null ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-white/5" />
            ))}
          </div>
        ) : (
          <ol className="relative border-l border-slate-200 dark:border-white/10 ml-2 space-y-5">
            {rows.map((h) => (
              <li key={h.id} className="pl-5 relative">
                <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${h.action === "rejected" ? "bg-rose-500" : h.action === "completed" ? "bg-emerald-500" : "bg-sky-500"}`} />
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {ACTION_LABEL[h.action]}
                  {h.to_stage_name && h.action !== "created" ? ` → ${h.to_stage_name}` : ""}
                  {h.action === "created" && h.to_stage_name ? ` at ${h.to_stage_name}` : ""}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {who(h.actor)} · {formatDate(h.created_at)}
                </p>
                {h.comment && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{h.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

/**
 * One generic page for every workflow stage. Stage names come from the database, so there is no
 * per-stage route or component; the URL carries the workflow and stage ids.
 */
export default function StageWorkspacePage() {
  const { workflowSlug, stageSlug } = useParams();
  const { ready: routesReady, resolve } = usePending();
  const route = resolve(workflowSlug ?? "", stageSlug ?? "");
  const wid = route?.workflowId ?? 0;
  const sid = route?.stageId ?? 0;

  const [stage, setStage] = useState<StageAccess | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [moving, setMoving] = useState<{ item: WorkItem; mode: "advance" | "reject" } | null>(null);
  const [historyFor, setHistoryFor] = useState<WorkItem | null>(null);

  const { refresh: refreshPending } = usePending();
  const table = useTableData(items, (i) => `${i.title} ${i.description ?? ""} ${who(i.creator)}`);

  async function load() {
    if (!routesReady) return;
    if (!route) {
      setStage(null);
      setError("You do not have access to this stage");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [s, list] = await Promise.all([fetchStage(wid, sid), fetchStageItems(wid, sid)]);
      setStage(s);
      setItems(list);
    } catch (err) {
      setStage(null);
      setError(err instanceof Error ? err.message : "Could not load this stage");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesReady, wid, sid]);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 2500);
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-11 h-11 rounded-2xl bg-slate-200 dark:bg-white/10" />
          <div className="space-y-2">
            <div className="h-5 w-40 bg-slate-200 dark:bg-white/10 rounded" />
            <div className="h-3 w-56 bg-slate-100 dark:bg-white/5 rounded" />
          </div>
        </div>
        <div className="rounded-[22px] bg-white dark:bg-[#0c1427]/70 border border-slate-200/80 dark:border-white/[0.08] divide-y divide-slate-100 dark:divide-white/[0.06] animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <div className="w-6 h-4 rounded bg-slate-100 dark:bg-white/5" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-48 bg-slate-200 dark:bg-white/10 rounded" />
                <div className="h-3 w-72 bg-slate-100 dark:bg-white/5 rounded" />
              </div>
              <div className="h-8 w-24 rounded-lg bg-slate-100 dark:bg-white/5" />
            </div>
          ))}
        </div>
      </PageContainer>
    );
  }

  if (error || !stage) {
    return (
      <PageContainer>
        <div className="bg-white dark:bg-[#0c1427]/70 rounded-[22px] border border-slate-200/80 dark:border-white/[0.08] p-12 flex flex-col items-center text-center gap-2">
          <ShieldAlert className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{error || "Stage not found"}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Ask an administrator to assign your role to this stage.</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        icon={getStageIcon(stage.stage_type)}
        title={stage.name}
        subtitle={STAGE_DESCRIPTION[stage.stage_type]}
      />

      {success && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-400">
          ✓ {success}
        </div>
      )}

      <div className="bg-white dark:bg-[#0c1427]/70 backdrop-blur-xl rounded-[22px] border border-slate-200/80 dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white">
            Items in {stage.name} <span className="text-slate-400 font-normal">({items.length})</span>
          </h2>
          <TableToolbar query={table.query} onQueryChange={table.setQuery} placeholder="Search items..." />
        </div>

        {items.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center gap-2">
            <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nothing to work on yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
              {`Items sent to ${stage.name} will appear here.`}
            </p>
          </div>
        ) : table.filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">No items match your search.</div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {table.paged.map((item, index) => (
                <li key={item.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors">
                  <span className="w-6 text-center text-sm text-slate-400">{(table.page - 1) * table.pageSize + index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.title}</p>
                    {item.description && <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{item.description}</p>}
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Added by {who(item.creator)} · {formatDate(item.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setHistoryFor(item)}
                      title="History"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-500/10 cursor-pointer"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    {!stage.is_first && (
                      <button
                        onClick={() => setMoving({ item, mode: "reject" })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Send back
                      </button>
                    )}
                    <button
                      onClick={() => setMoving({ item, mode: "advance" })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer"
                      style={{ background: BRAND_GRADIENT }}
                    >
                      {stage.is_last ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                        </>
                      ) : (
                        <>
                          Send forward <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
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

      {moving && (
        <MoveModal
          item={moving.item}
          mode={moving.mode}
          isLast={stage.is_last}
          onClose={() => setMoving(null)}
          onDone={() => {
            const { item, mode } = moving;
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            setMoving(null);
            refreshPending();
            flash(mode === "reject" ? `"${item.title}" sent back` : stage.is_last ? `"${item.title}" completed` : `"${item.title}" sent forward`);
          }}
        />
      )}
      {historyFor && <HistoryModal item={historyFor} onClose={() => setHistoryFor(null)} />}
    </PageContainer>
  );
}
