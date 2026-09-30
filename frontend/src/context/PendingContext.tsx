import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { useLive } from "@/context/LiveContext";
import { fetchPendingByStage, type PendingStage } from "@/services/workflow";
import { buildStageRoutes, type StageRoute } from "@/lib/slug";

interface PendingValue {
  /** Stages the user may open, with how many open items wait at each. */
  stages: PendingStage[];
  /** Total open items across those stages. */
  total: number;
  /** Re-read the counts now (call after moving an item). Does not raise a notification. */
  refresh: () => Promise<void>;
  /** Pending count for one stage (0 when unknown). */
  countFor: (stageId: number) => number;
  /** True once the first load finished (so "not found" is not shown while still loading). */
  ready: boolean;
  /** Readable address of a stage, e.g. /workflows/demo/production. */
  pathFor: (stageId: number) => string;
  /** Turn the slugs from an address back into ids; null when the user cannot open it. */
  resolve: (workflowSlug: string, stageSlug: string) => StageRoute | null;
  /** The route of a stage looked up by ids (used to redirect old id-based links). */
  routeById: (workflowId: number, stageId: number) => StageRoute | null;
}

const PendingContext = createContext<PendingValue>({
  stages: [],
  total: 0,
  refresh: async () => {},
  countFor: () => 0,
  ready: false,
  pathFor: () => "/dashboard",
  resolve: () => null,
  routeById: () => null,
});

export const usePending = () => useContext(PendingContext);

interface Toast {
  id: number;
  stage: PendingStage;
  added: number;
}

/**
 * Keeps the per-stage open-item counts fresh (refreshed when the server pushes a change) and shows a
 * toast when new work arrives in a stage the user can open.
 */
export function PendingProvider({ children }: { children: React.ReactNode }) {
  const [stages, setStages] = useState<PendingStage[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ready, setReady] = useState(false);
  const previous = useRef<Map<number, number> | null>(null);
  const toastId = useRef(0);

  const load = useCallback(async (notify: boolean) => {
    try {
      const data = await fetchPendingByStage();
      const prev = previous.current;
      if (notify && prev) {
        const fresh: Toast[] = [];
        for (const s of data) {
          const before = prev.get(s.stage_id) ?? 0;
          if (s.count > before) fresh.push({ id: ++toastId.current, stage: s, added: s.count - before });
        }
        if (fresh.length) {
          setToasts((t) => [...t, ...fresh].slice(-4));
          fresh.forEach((f) => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== f.id)), 8000));
        }
      }
      previous.current = new Map(data.map((s) => [s.stage_id, s.count]));
      setStages(data);
    } catch {
      // not signed in yet, or the server is briefly unavailable; try again on the next poll
    } finally {
      setReady(true);
    }
  }, []);

  // First load only. Later updates are pushed by the server (see LiveContext), so there is no polling.
  useEffect(() => {
    load(false);
  }, [load]);

  // Pushed from the server: permissions/workflows changed (silent) or items moved (may raise a toast).
  const { accessVersion, workVersion } = useLive();
  const firstAccess = useRef(true);
  const firstWork = useRef(true);
  useEffect(() => {
    if (firstAccess.current) {
      firstAccess.current = false;
      return;
    }
    load(false);
  }, [accessVersion, load]);
  useEffect(() => {
    if (firstWork.current) {
      firstWork.current = false;
      return;
    }
    load(true);
  }, [workVersion, load]);

  const routes = useMemo(() => buildStageRoutes(stages), [stages]);

  const value = useMemo<PendingValue>(
    () => ({
      stages,
      total: stages.reduce((n, s) => n + s.count, 0),
      refresh: () => load(false),
      countFor: (id) => stages.find((s) => s.stage_id === id)?.count ?? 0,
      ready,
      pathFor: (id) => routes.find((r) => r.stageId === id)?.path ?? "/dashboard",
      resolve: (w, s) => routes.find((r) => r.workflowSlug === w && r.stageSlug === s) ?? null,
      routeById: (w, s) => routes.find((r) => r.workflowId === w && r.stageId === s) ?? null,
    }),
    [stages, load, ready, routes]
  );

  return (
    <PendingContext.Provider value={value}>
      {children}
      <div className="fixed top-20 right-5 z-[150] flex flex-col gap-2 w-80 max-w-[calc(100vw-2.5rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-white dark:bg-[#0c1427] shadow-xl p-3.5"
          >
            <span className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </span>
            <Link
              to={routes.find((r) => r.stageId === t.stage.stage_id)?.path ?? "/dashboard"}
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="flex-1 min-w-0"
            >
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                {t.added} new item{t.added > 1 ? "s" : ""} in {t.stage.stage_name}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{t.stage.workflow_name}</p>
            </Link>
            <button
              type="button"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </PendingContext.Provider>
  );
}
