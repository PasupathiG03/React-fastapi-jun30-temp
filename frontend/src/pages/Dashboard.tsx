import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart2,
  Inbox,
  Layers,
  LayoutDashboard,
  Shield,
  TrendingUp,
  UserCheck,
  Users,
  Workflow,
  ArrowUpRight,
} from "lucide-react";
import { fetchUsers } from "@/services/user";
import { fetchRoles } from "@/services/role";
import { fetchWorkflows } from "@/services/workflow";
import { fetchMenus, type MenuItem } from "@/services/menu";
import { API_BASE_URL } from "@/lib/constants";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { usePending } from "@/context/PendingContext";
import { useLive } from "@/context/LiveContext";

interface Me {
  employee_name: string | null;
  employee_id: string;
  is_superuser: boolean;
  role?: { name: string } | null;
}

interface Stat {
  label: string;
  value: number;
  icon: typeof Users;
  iconColor: string;
  bg: string;
}

const QUICK_ACTIONS = [
  { label: "Manage Users", href: "/access-control/user-management" },
  { label: "Manage Roles", href: "/access-control/role-management" },
  { label: "Menu Access", href: "/access-control/menu-access" },
  { label: "Manage Menus", href: "/developer-management/process-screen" },
  { label: "Manage Workflows", href: "/access-control/workflow-management" },
];

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stat[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const { stages: pendingStages, total: pendingTotal, pathFor } = usePending();
  const { accessVersion } = useLive();
  const waitingStages = pendingStages.filter((s) => s.count > 0);
  const isAdmin = !!me && (me.is_superuser && me.role?.name?.trim().toLowerCase() === "developer");

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessVersion]);

  async function loadStats() {
    const [meRes, menusRes] = await Promise.allSettled([
      fetch(`${API_BASE_URL}/api/auth/me`).then((r) =>
        r.ok ? r.json() : null
      ),
      fetchMenus(),
    ]);
    const meData: Me | null = meRes.status === "fulfilled" ? meRes.value : null;
    const myMenus = menusRes.status === "fulfilled" ? menusRes.value : [];
    setMe(meData);
    setMenus(myMenus);

    const admin = !!meData && (meData.is_superuser && meData.role?.name?.trim().toLowerCase() === "developer");
    if (admin) {
      const [usersResult, rolesResult, workflowsResult] = await Promise.allSettled([
        fetchUsers(),
        fetchRoles(),
        fetchWorkflows(),
      ]);

      const users = usersResult.status === "fulfilled" ? usersResult.value : [];
      const roles = rolesResult.status === "fulfilled" ? rolesResult.value : [];
      const workflows = workflowsResult.status === "fulfilled" ? workflowsResult.value : [];

      setStats([
        { label: "Total Users", value: users.length, icon: Users, iconColor: "#0284c7", bg: "rgba(2, 132, 199, 0.12)" },
        {
          label: "Active Users",
          value: users.filter((u) => u.is_active).length,
          icon: UserCheck,
          iconColor: "#10b981",
          bg: "rgba(16, 185, 129, 0.12)",
        },
        { label: "Total Roles", value: roles.length, icon: Shield, iconColor: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" },
        { label: "Total Workflows", value: workflows.length, icon: Workflow, iconColor: "#8b5cf6", bg: "rgba(139, 92, 246, 0.12)" },
      ]);
    } else {
      setStats([
        {
          label: "Screens You Can Access",
          value: myMenus.length,
          icon: LayoutDashboard,
          iconColor: "#0284c7",
          bg: "rgba(2, 132, 199, 0.12)",
        },
        {
          label: "Processes",
          value: new Set(myMenus.map((m) => m.process_id).filter((id) => id != null)).size,
          icon: Layers,
          iconColor: "#8b5cf6",
          bg: "rgba(139, 92, 246, 0.12)",
        },
      ]);
    }
    setLoading(false);
  }

  const quickActions = [
    ...(isAdmin ? QUICK_ACTIONS : []),
    ...menus
      .filter((m) => !QUICK_ACTIONS.some((q) => q.href === m.url))
      .map((m) => ({ label: m.name, href: m.url })),
  ];

  return (
    <PageContainer>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Overview and quick platform navigation"
      />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading
          ? [...Array(4)].map((_, i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-5 flex items-center gap-4 animate-pulse"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-16 bg-slate-200 dark:bg-white/10 rounded" />
                <div className="h-3.5 w-24 bg-slate-100 dark:bg-white/5 rounded" />
              </div>
            </div>
          ))
          : stats.map(({ label, value, icon: Icon, iconColor, bg }) => (
            <div
              key={label}
              className="glass-card glass-lift rounded-2xl p-5 flex items-center gap-4 hover:border-sky-500/40"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: bg }}
              >
                <Icon className="w-6 h-6" style={{ color: iconColor }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {value}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
      </div>

      {/* ── Quick Actions + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quick Actions */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-sky-500" />
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Quick Actions</h3>
          </div>
          <div className="space-y-2">
            {quickActions.map(({ label, href }) => (
              <Link
                key={href}
                to={href}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 dark:border-white/[0.06] hover:border-sky-500/30 dark:hover:border-sky-500/30 bg-white/30 dark:bg-white/[0.02] hover:bg-sky-50/50 dark:hover:bg-sky-500/10 transition-all group"
              >
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-sky-600 dark:group-hover:text-sky-400">
                  {label}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Work waiting for this user's stages */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-sky-500" />
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Work waiting for you</h3>
            </div>
            {pendingTotal > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                {pendingTotal} open
              </span>
            )}
          </div>

          {waitingStages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-2.5 text-slate-400">
                <BarChart2 className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">You are all caught up</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Items that reach one of your workflow stages will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {waitingStages.map((s) => (
                <Link
                  key={s.stage_id}
                  to={pathFor(s.stage_id)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 dark:border-white/[0.06] hover:border-sky-500/30 bg-white/30 dark:bg-white/[0.02] hover:bg-sky-50/50 dark:hover:bg-sky-500/10 transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400">
                      {s.stage_name}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {s.workflow_name} · Stage {s.sequence_order}
                    </p>
                  </div>
                  <span className="min-w-[26px] h-6 px-2 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-bold flex items-center justify-center">
                    {s.count}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
