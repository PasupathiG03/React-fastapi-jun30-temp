import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";
import { fetchMenus, type MenuItem } from "@/services/menu";
import { useLive } from "@/context/LiveContext";
import PageContainer from "@/components/PageContainer";
import DashboardSkeleton from "@/components/DashboardSkeleton";

const Dashboard = lazy(() => import("./Dashboard"));

type Decision =
  | { kind: "loading" }
  | { kind: "dashboard" }
  | { kind: "redirect"; to: string }
  | { kind: "none" };

/**
 * The Dashboard is only for Developers. Everyone else has no dashboard permission, so they are sent to
 * the first screen their role can open (or told that nothing is assigned yet).
 */
export default function DashboardGate() {
  const { accessVersion } = useLive();
  const [decision, setDecision] = useState<Decision>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [meRes, menusRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/auth/me`).then((r) =>
          r.ok ? r.json() : null
        ),
        fetchMenus(),
      ]);
      if (cancelled) return;

      const me = meRes.status === "fulfilled" ? meRes.value : null;
      if (me && (me.is_superuser && me.role?.name?.trim().toLowerCase() === "developer")) {
        setDecision({ kind: "dashboard" });
        return;
      }

      const menus: MenuItem[] = menusRes.status === "fulfilled" ? menusRes.value : [];
      const firstScreen = [...menus].sort(
        (a, b) => (a.process?.order ?? 0) - (b.process?.order ?? 0) || a.order - b.order || a.id - b.id
      )[0];
      if (firstScreen) {
        setDecision({ kind: "redirect", to: firstScreen.url });
        return;
      }

      setDecision({ kind: "none" });
    })();
    return () => {
      cancelled = true;
    };
  }, [accessVersion]);

  if (decision.kind === "loading") return <DashboardSkeleton />;
  if (decision.kind === "dashboard") return (
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    );
  if (decision.kind === "redirect") return <Navigate to={decision.to} replace />;

  return (
    <PageContainer>
      <div className="glass-card rounded-[22px] p-12 flex flex-col items-center text-center gap-2">
        <Lock className="w-10 h-10 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No screens are assigned to your role yet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
          Ask an administrator to give your role access. This page updates by itself once access is granted.
        </p>
      </div>
    </PageContainer>
  );
}
