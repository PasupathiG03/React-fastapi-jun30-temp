import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { fetchProcesses, type ProcessItem } from "@/services/process";
import {
  fetchAccessMatrix,
  fetchStageAccessMatrix,
  setAccess,
  setStageAccess,
  type AccessMatrix,
} from "@/services/access";
import { fetchWorkflows, type WorkflowDetail } from "@/services/workflow";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { CustomSelect } from "@/components/CustomSelect";
import { CustomCheckbox } from "@/components/CustomCheckbox";

const key = (roleId: number, menuId: number) => `${roleId}:${menuId}`;

export default function MenuAccessPage() {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDetail[]>([]);
  // "p:<id>" = a process (its screens), "w:<id>" = a workflow (its stages)
  const [target, setTarget] = useState<string | null>(null);
  const isWorkflow = target?.startsWith("w:") ?? false;
  const targetId = target ? Number(target.slice(2)) : null;
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchProcesses().catch(() => [] as ProcessItem[]), fetchWorkflows().catch(() => [] as WorkflowDetail[])])
      .then(([procs, wfs]) => {
        setProcesses(procs);
        setWorkflows(wfs);
        const first = procs[0] ? `p:${procs[0].id}` : wfs[0] ? `w:${wfs[0].id}` : null;
        setTarget(first);
        if (!first) setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (target == null || targetId == null) return;
    setLoading(true);
    setError("");
    (isWorkflow ? fetchStageAccessMatrix(targetId) : fetchAccessMatrix(targetId))
      .then(setMatrix)
      .catch(() => setError(isWorkflow ? "Failed to load stage access" : "Failed to load screen access"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const granted = useMemo(() => new Set(matrix?.grants.map((g) => key(g.role_id, g.menu_id))), [matrix]);

  // The Developer role has full system access by default, so we only display configurable roles in the matrix
  const orderedRoles = useMemo(() => {
    if (!matrix?.roles) return [];
    return matrix.roles
      .filter((r) => r.name.trim().toLowerCase() !== "developer")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [matrix?.roles]);

  async function toggle(roleId: number, menuId: number, nextAllowed?: boolean) {
    if (!matrix) return;
    const isGrantedNow = granted.has(key(roleId, menuId));
    const allowed = nextAllowed !== undefined ? nextAllowed : !isGrantedNow;
    setError("");
    const before = matrix;
    setMatrix({
      ...matrix,
      grants: allowed
        ? [...matrix.grants.filter((g) => !(g.role_id === roleId && g.menu_id === menuId)), { role_id: roleId, menu_id: menuId }]
        : matrix.grants.filter((g) => !(g.role_id === roleId && g.menu_id === menuId)),
    });
    try {
      await (isWorkflow ? setStageAccess(roleId, menuId, allowed) : setAccess(roleId, menuId, allowed));
    } catch {
      setMatrix(before);
      setError("Failed to update access");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        icon={ShieldCheck}
        title="Menu Access"
        subtitle="Choose which roles can see each screen and workflow stage in the sidebar"
      />

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs font-medium text-red-600 dark:text-red-400 shadow-sm">
          {error}
        </div>
      )}

      {/* ── Main Content Card ── */}
      <div className="glass-card rounded-[22px] overflow-hidden">
        {/* Card Header: Screens & Process Select */}
        <div className="relative z-20 px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{isWorkflow ? "Stages" : "Screens"}</h2>
          <div className="flex items-center gap-2.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Process / Workflow</label>
            <CustomSelect
              value={target ?? undefined}
              onChange={(val) => setTarget(String(val))}
              options={[
                ...processes.map((p) => ({ value: `p:${p.id}`, label: p.name })),
                ...workflows.map((w) => ({ value: `w:${w.id}`, label: `Workflow: ${w.name}` })),
              ]}
              placeholder={loading && !target ? "Loading..." : processes.length + workflows.length === 0 ? "Nothing to show" : "Select"}
              className="w-64"
              size="sm"
            />
          </div>
        </div>

        {/* Matrix Table with vertical lines and Developer first */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200/90 dark:border-white/[0.08] bg-white/45 dark:bg-white/[0.02]">
                <th className="px-6 py-3.5 font-semibold border-r border-slate-200/90 dark:border-white/[0.08]">
                  {isWorkflow ? "Stage" : "Screen"}
                </th>
                {orderedRoles.length > 0
                  ? orderedRoles.map((r, idx) => (
                    <th
                      key={r.id}
                      className={`px-6 py-3.5 text-center font-semibold whitespace-nowrap border-r border-slate-200/90 dark:border-white/[0.08] ${idx === orderedRoles.length - 1 ? "border-r-0" : ""
                        }`}
                    >
                      {r.name}
                    </th>
                  ))
                  : [1, 2, 3, 4].map((i, idx) => (
                    <th
                      key={i}
                      className={`px-6 py-3.5 text-center font-semibold whitespace-nowrap border-r border-slate-200/90 dark:border-white/[0.08] ${idx === 3 ? "border-r-0" : ""
                        }`}
                    >
                      <div className="h-3.5 w-16 mx-auto bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/90 dark:divide-white/[0.06]">
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4 border-r border-slate-200/90 dark:border-white/[0.08]">
                      <div
                        className="h-4 bg-slate-200 dark:bg-white/10 rounded-md"
                        style={{ width: `${55 + ((i * 19) % 35)}%` }}
                      />
                    </td>
                    {(orderedRoles.length > 0 ? orderedRoles : [1, 2, 3, 4]).map((item, idx, arr) => (
                      <td
                        key={typeof item === "number" ? item : item.id}
                        className={`px-6 py-4 text-center border-r border-slate-200/90 dark:border-white/[0.08] ${idx === arr.length - 1 ? "border-r-0" : ""
                          }`}
                      >
                        <div className="w-4 h-4 mx-auto bg-slate-200 dark:bg-white/10 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !matrix || matrix.screens.length === 0 ? (
                <tr>
                  <td
                    colSpan={orderedRoles.length + 1}
                    className="px-6 py-12 text-center text-slate-400 dark:text-slate-500"
                  >
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{isWorkflow ? "No stages in this workflow yet" : "No screens in this process yet"}</p>
                  </td>
                </tr>
              ) : (
                matrix.screens.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-white/40 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200/90 dark:border-white/[0.08]">
                      {s.name}
                    </td>
                    {orderedRoles.map((r, idx) => (
                      <td
                        key={r.id}
                        className={`px-6 py-4 text-center border-r border-slate-200/90 dark:border-white/[0.08] ${idx === orderedRoles.length - 1 ? "border-r-0" : ""
                          }`}
                      >
                        <div className="flex items-center justify-center">
                          <CustomCheckbox
                            checked={granted.has(key(r.id, s.id))}
                            onChange={(nextVal) => toggle(r.id, s.id, nextVal)}
                            title={`${r.name} → ${s.name}`}
                            size="md"
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-white/[0.06] bg-white/25 dark:bg-white/[0.01]">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Note: The <span className="font-semibold text-slate-700 dark:text-slate-300">Developer</span> role has full access to all screens and stages by default and is not shown in this matrix.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
