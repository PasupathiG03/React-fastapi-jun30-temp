import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { fetchProcesses, type ProcessItem } from "@/services/process";
import { fetchAccessMatrix, setAccess, type AccessMatrix } from "@/services/access";

const BRAND_GRADIENT = "linear-gradient(135deg, #1d55e8, #1235b0)";

const key = (roleId: number, menuId: number) => `${roleId}:${menuId}`;

export default function MenuAccessPage() {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [processId, setProcessId] = useState<number | null>(null);
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProcesses()
      .then((data) => {
        setProcesses(data);
        setProcessId(data[0]?.id ?? null);
        if (data.length === 0) setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (processId == null) return;
    setLoading(true);
    fetchAccessMatrix(processId)
      .then(setMatrix)
      .catch(() => setError("Failed to load screen access"))
      .finally(() => setLoading(false));
  }, [processId]);

  const granted = useMemo(() => new Set(matrix?.grants.map((g) => key(g.role_id, g.menu_id))), [matrix]);

  async function toggle(roleId: number, menuId: number) {
    if (!matrix) return;
    const allowed = !granted.has(key(roleId, menuId));
    setError("");
    // Optimistic update, rolled back if the request fails.
    const before = matrix;
    setMatrix({
      ...matrix,
      grants: allowed
        ? [...matrix.grants, { role_id: roleId, menu_id: menuId }]
        : matrix.grants.filter((g) => !(g.role_id === roleId && g.menu_id === menuId)),
    });
    try {
      await setAccess(roleId, menuId, allowed);
    } catch {
      setMatrix(before);
      setError("Failed to update access");
    }
  }

  return (
    <div className="p-6 w-full space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: BRAND_GRADIENT }}
        >
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Menu Access</h1>
          <p className="text-sm text-gray-500">Choose which roles can see each screen in the sidebar</p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600 shadow-sm">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-800">Screens</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500">Process</label>
            <select
              value={processId ?? ""}
              onChange={(e) => setProcessId(Number(e.target.value))}
              className="w-56 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            >
              {processes.length === 0 && <option value="">No processes</option>}
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/50">
                <th className="px-6 py-3">Screen</th>
                {matrix?.roles.map((r) => (
                  <th key={r.id} className="px-6 py-3 text-center whitespace-nowrap">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [1, 2, 3].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4" colSpan={(matrix?.roles.length ?? 0) + 1}>
                      <div className="h-4 bg-gray-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : !matrix || matrix.screens.length === 0 ? (
                <tr>
                  <td colSpan={(matrix?.roles.length ?? 0) + 1} className="px-6 py-12 text-center text-gray-400">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No screens in this process yet</p>
                  </td>
                </tr>
              ) : (
                matrix.screens.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-gray-800">{s.name}</td>
                    {matrix.roles.map((r) => (
                      <td key={r.id} className="px-6 py-3.5 text-center">
                        {r.name === "Developer" ? (
                          <input
                            type="checkbox"
                            checked
                            disabled
                            className="w-4 h-4 rounded accent-blue-600 opacity-60 cursor-not-allowed"
                            title="Developer always has access to every screen"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={granted.has(key(r.id, s.id))}
                            onChange={() => toggle(r.id, s.id)}
                            className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                            title={`${r.name} → ${s.name}`}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
