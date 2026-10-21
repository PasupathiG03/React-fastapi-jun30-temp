import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bug, ChevronRight, LifeBuoy, Lightbulb, MessageSquare, Plus, Send, X } from "lucide-react";
import { showError, showSuccess, showUpdate } from "../lib/toast";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { CustomSelect } from "@/components/CustomSelect";
import { TablePagination, TableSearchInput } from "@/components/DataTableControls";
import { useTableData } from "@/hooks/useTableData";
import {
  addTicketReply,
  createTicket,
  fetchTicket,
  fetchTickets,
  updateTicket,
  type TicketDetail,
  type TicketItem,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from "@/services/ticket";

type Tab = "all" | "open" | "resolved";

const TYPE_META: Record<TicketType, { label: string; Icon: React.ElementType; className: string }> = {
  bug: { label: "Bug", Icon: Bug, className: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  requirement: {
    label: "Requirement",
    Icon: Lightbulb,
    className: "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
};

const STATUS_META: Record<TicketStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  in_progress: { label: "In progress", className: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  resolved: { label: "Resolved", className: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

const PRIORITY_LABEL: Record<TicketPriority, string> = { low: "Low", medium: "Medium", high: "High" };

const STATUS_OPTIONS = (Object.keys(STATUS_META) as TicketStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label }));
const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));

const isOpen = (t: TicketItem) => t.status !== "resolved";

const creatorName = (c?: { employee_id: string; employee_name?: string | null } | null) =>
  c?.employee_name || c?.employee_id || "System";

/** "22m ago", "3h ago", "Yesterday", then a short date -- like the Updated column in most help desks. */
function relativeTime(iso: string): string {
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "Yesterday";
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

function TypeBadge({ type }: { type: TicketType }) {
  const { label, Icon, className } = TYPE_META[type];
  return (
    <Badge className={className}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}

const fieldClass =
  "w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 glass-field placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors";
const labelClass = "text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide";
const primaryButtonClass =
  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 transition-all disabled:opacity-60 shadow-sm";

export default function Support() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);
  // Stable, so the detail panel's load effect doesn't re-fetch every time the list re-renders.
  const closeTicket = useCallback(() => setOpenTicketId(null), []);

  useEffect(() => {
    fetchTickets()
      .then(setTickets)
      .catch((err) => showError(err instanceof Error ? err.message : "Failed to load tickets"))
      .finally(() => setLoading(false));
  }, []);

  const openCount = tickets.filter(isOpen).length;
  const visible = useMemo(
    () => (tab === "all" ? tickets : tickets.filter((t) => (tab === "open" ? isOpen(t) : !isOpen(t)))),
    [tickets, tab]
  );
  const table = useTableData(visible, (t) => `#${t.id} ${t.subject} ${TYPE_META[t.type].label} ${creatorName(t.creator)}`);

  // Keep a ticket's row in the list in step with whatever the detail panel changed.
  function syncTicket(detail: TicketItem) {
    setTickets((prev) => {
      const rest = prev.filter((t) => t.id !== detail.id);
      return [detail, ...rest].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
    });
  }

  return (
    <PageContainer>
      <PageHeader
        icon={LifeBuoy}
        title="Your requests"
        subtitle={`${openCount} open · ${tickets.length - openCount} resolved`}
        loading={loading}
        actions={
          <button type="button" onClick={() => setNewOpen(true)} className={primaryButtonClass}>
            <Plus className="w-4 h-4" />
            New request
          </button>
        }
      />

      <div className="glass-card rounded-[22px] overflow-hidden">
        {/* Table header bar: title + tabs on the left, search on the right (same layout as Role Management). */}
        {loading ? (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between animate-pulse">
            <div className="h-4 w-32 bg-slate-200 dark:bg-white/10 rounded" />
            <div className="h-7 w-52 bg-slate-100 dark:bg-white/5 rounded-xl" />
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex flex-wrap sm:flex-nowrap sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Requests</h2>
              <span className="text-xs text-slate-400">
                {table.filtered.length} request{table.filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="inline-flex p-0.5 rounded-xl border border-slate-200 dark:border-white/10 glass-field sm:ml-3">
              {(["all", "open", "resolved"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    table.setPage(1);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${tab === t
                    ? "bg-sky-500/15 text-sky-700 dark:text-white dark:bg-white/10"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <TableSearchInput
              query={table.query}
              onQueryChange={table.setQuery}
              placeholder="Search by subject or number"
              className="basis-full sm:basis-auto sm:w-64 sm:ml-auto"
            />
          </div>
        )}

        {/* Column headings (hidden on phones, where each row stacks) */}
        <div className="hidden sm:grid grid-cols-[80px_1fr_120px_100px_20px] gap-4 px-6 py-3 border-b border-slate-100 dark:border-white/[0.06] text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          <span>Ticket</span>
          <span>Subject</span>
          <span>Status</span>
          <span className="text-right">Updated</span>
          <span />
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04] animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-3 w-12 bg-slate-200 dark:bg-white/10 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-56 bg-slate-200 dark:bg-white/10 rounded" />
                  <div className="h-3 w-40 bg-slate-100 dark:bg-white/5 rounded" />
                </div>
                <div className="h-5 w-16 bg-slate-100 dark:bg-white/5 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {visible.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-slate-500">
                <LifeBuoy className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">{tickets.length === 0 ? "No requests yet" : `No ${tab} requests`}</p>
                {tickets.length === 0 && <p className="text-xs mt-0.5">Report a bug or ask for a new requirement with "New request"</p>}
              </div>
            )}
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.04] m-0 p-0">
              {table.paged.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setOpenTicketId(t.id)}
                    className="group w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[80px_1fr_120px_100px_20px] gap-x-4 gap-y-1.5 items-center px-6 py-3.5 hover:bg-white/35 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="hidden sm:block font-mono text-xs text-slate-500 dark:text-slate-400">#{t.id}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                        <span className="sm:hidden font-mono font-normal text-slate-400 mr-1.5">#{t.id}</span>
                        {t.subject}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <TypeBadge type={t.type} />
                        <span>{creatorName(t.creator)}</span>
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}
                        </span>
                      </span>
                    </span>
                    <span className="sm:col-auto justify-self-end sm:justify-self-start">
                      <Badge className={STATUS_META[t.status].className}>{STATUS_META[t.status].label}</Badge>
                    </span>
                    <span className="hidden sm:block text-right text-xs text-slate-500 dark:text-slate-400">{relativeTime(t.updated_at)}</span>
                    <ChevronRight className="hidden sm:block w-4 h-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
            {visible.length > 0 && table.filtered.length === 0 && (
              <div className="py-10 text-center text-xs text-slate-400">No results match your search</div>
            )}
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

      {newOpen && (
        <NewTicketModal
          onClose={() => setNewOpen(false)}
          onCreated={(t) => {
            setTickets((prev) => [t, ...prev]);
            setNewOpen(false);
            setTab("all");
          }}
        />
      )}
      {openTicketId !== null && (
        <TicketDetailModal ticketId={openTicketId} onClose={closeTicket} onChanged={syncTicket} />
      )}
    </PageContainer>
  );
}

function ModalShell({ title, icon, onClose, children }: { title: React.ReactNode; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="glass-modal rounded-2xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between gap-3 rounded-t-2xl bg-white/30 dark:bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: TicketItem) => void }) {
  const [type, setType] = useState<TicketType>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return showError("Subject is required");
    if (!description.trim()) return showError("Description is required");
    setSubmitting(true);
    try {
      const created = await createTicket({ type, subject: subject.trim(), description: description.trim(), priority });
      showSuccess(`Request #${created.id} raised`);
      onCreated(created);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to raise request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="New request" icon={<Plus className="w-4 h-4 text-sky-500" />} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="space-y-1.5">
            <span className={labelClass}>
              What is it? <span className="text-rose-500">*</span>
            </span>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
                const { label, Icon } = TYPE_META[t];
                const selected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={selected}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${selected
                      ? "border-sky-400 bg-sky-50 dark:bg-sky-500/10 dark:border-sky-500/50"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                      }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${selected ? "text-sky-500" : "text-slate-400"}`} />
                    <span>
                      <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {t === "bug" ? "Something in the tool is broken" : "A new feature or change you need"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ticket-subject" className={labelClass}>
              Subject <span className="text-rose-500">*</span>
            </label>
            <input
              id="ticket-subject"
              value={subject}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={type === "bug" ? "e.g. Export button does nothing on User Management" : "e.g. Allow bulk role assignment"}
              className={fieldClass}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ticket-description" className={labelClass}>
              Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder={
                type === "bug"
                  ? "Steps to reproduce, what you expected, and what happened instead"
                  : "What you need, who it is for, and why"
              }
              className={`${fieldClass} resize-y`}
            />
          </div>

          <div className="space-y-1.5 max-w-[200px]">
            <span className={labelClass}>Priority</span>
            <CustomSelect value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} size="sm" ariaLabel="Priority" />
          </div>
        </div>

        <div className="px-6 py-4 bg-white/30 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end shrink-0 rounded-b-2xl">
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            <Send className="w-4 h-4" />
            {submitting ? "Submitting..." : "Submit request"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function TicketDetailModal({
  ticketId,
  onClose,
  onChanged,
}: {
  ticketId: number;
  onClose: () => void;
  onChanged: (t: TicketItem) => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchTicket(ticketId)
      .then(setTicket)
      .catch((err) => {
        showError(err instanceof Error ? err.message : "Failed to load ticket");
        onClose();
      });
  }, [ticketId, onClose]);

  async function handleUpdate(payload: { status?: TicketStatus; priority?: TicketPriority }) {
    try {
      const updated = await updateTicket(ticketId, payload);
      setTicket(updated);
      onChanged(updated);
      showUpdate(payload.status ? `Marked as ${STATUS_META[payload.status].label.toLowerCase()}` : "Priority updated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update ticket");
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || !ticket) return;
    setSending(true);
    try {
      const created = await addTicketReply(ticketId, reply.trim());
      const next = { ...ticket, replies: [...ticket.replies, created], reply_count: ticket.reply_count + 1, updated_at: created.created_at };
      setTicket(next);
      onChanged(next);
      setReply("");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <ModalShell
      title={ticket ? `#${ticket.id} · ${ticket.subject}` : "Loading..."}
      icon={<LifeBuoy className="w-4 h-4 text-sky-500 shrink-0" />}
      onClose={onClose}
    >
      {!ticket ? (
        <div className="p-6 space-y-3 animate-pulse">
          <div className="h-4 w-48 bg-slate-200 dark:bg-white/10 rounded" />
          <div className="h-20 bg-slate-100 dark:bg-white/5 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <span className={labelClass}>Type</span>
                <div>
                  <TypeBadge type={ticket.type} />
                </div>
              </div>
              <div className="space-y-1.5 w-40">
                <span className={labelClass}>Status</span>
                <CustomSelect
                  value={ticket.status}
                  onChange={(s) => s !== ticket.status && handleUpdate({ status: s })}
                  options={STATUS_OPTIONS}
                  size="sm"
                  ariaLabel="Status"
                />
              </div>
              <div className="space-y-1.5 w-32">
                <span className={labelClass}>Priority</span>
                <CustomSelect
                  value={ticket.priority}
                  onChange={(p) => p !== ticket.priority && handleUpdate({ priority: p })}
                  options={PRIORITY_OPTIONS}
                  size="sm"
                  ariaLabel="Priority"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-white/40 dark:bg-white/[0.02]">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                Raised by <span className="font-semibold">{creatorName(ticket.creator)}</span> ·{" "}
                {new Date(ticket.created_at).toLocaleString()}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{ticket.description}</p>
            </div>

            <div className="space-y-3">
              <p className={labelClass}>
                Replies <span className="text-slate-400 normal-case font-normal">({ticket.replies.length})</span>
              </p>
              {ticket.replies.length === 0 ? (
                <p className="text-xs text-slate-400">No replies yet.</p>
              ) : (
                ticket.replies.map((r) => (
                  <div key={r.id} className="rounded-xl p-3 bg-slate-50 dark:bg-white/[0.04]">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      <span className="font-semibold">{creatorName(r.creator)}</span> · {relativeTime(r.created_at)}
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{r.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <form
            onSubmit={handleReply}
            className="px-6 py-4 bg-white/30 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex items-end gap-3 shrink-0 rounded-b-2xl"
          >
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Write a reply..."
              aria-label="Reply"
              className={`${fieldClass} resize-none flex-1`}
            />
            <button type="submit" disabled={sending || !reply.trim()} className={primaryButtonClass}>
              <Send className="w-4 h-4" />
              {sending ? "Sending..." : "Reply"}
            </button>
          </form>
        </>
      )}
    </ModalShell>
  );
}
