import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Layers,
  LayoutDashboard,
  Shield,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Workflow,
} from "lucide-react";
import { fetchUsers, type UserItem } from "@/services/user";
import { fetchRoles } from "@/services/role";
import { fetchWorkflows } from "@/services/workflow";
import { fetchMenus, type MenuItem } from "@/services/menu";
import { API_BASE_URL } from "@/lib/constants";
import PageContainer from "@/components/PageContainer";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import EmptyState from "@/components/EmptyState";
import { getScreenIcon } from "@/components/Sidebar";
import { useLive } from "@/context/LiveContext";
import { hasFullAccess } from "@/lib/access";
import { DASHBOARD_PATHS } from "@/lib/lazyPages";

interface Me {
  employee_name: string | null;
  employee_id: string;
  is_superuser: boolean;
  role?: { name: string } | null;
}

interface Stat {
  label: string;
  value: number;
  hint: string;
  icon: React.ElementType;
  /** Icon tile tint; every colour has its dark pair. */
  tone: string;
  href?: string;
}

interface QuickAction {
  label: string;
  href: string;
  group: string;
  icon: React.ElementType;
}

const TONES = {
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
};

// Developer-only built-ins: always offered first, whatever the menus table holds.
const ADMIN_ACTIONS: QuickAction[] = [
  { label: "User Management", href: "/access-control/user-management", group: "Access Control", icon: Users },
  { label: "Role Management", href: "/access-control/role-management", group: "Access Control", icon: Shield },
  { label: "Menu Access", href: "/access-control/menu-access", group: "Access Control", icon: ShieldCheck },
  { label: "Workflow Management", href: "/access-control/workflow-management", group: "Access Control", icon: Workflow },
  { label: "Router Setup", href: "/developer-management/router-setup", group: "Developer", icon: Layers },
];

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Users per role, biggest first; users without a role are grouped as "No role". */
function usersByRole(users: UserItem[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const u of users) {
    if (!u.is_active) continue;
    const name = u.role?.name ?? "No role";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stat[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [roleBreakdown, setRoleBreakdown] = useState<{ name: string; count: number }[]>([]);
  const { accessVersion } = useLive();
  const isAdmin = hasFullAccess(me);

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessVersion]);

  async function loadStats() {
    const [meRes, menusRes] = await Promise.allSettled([
      fetch(`${API_BASE_URL}/api/auth/me`).then((r) => (r.ok ? r.json() : null)),
      fetchMenus(),
    ]);
    const meData: Me | null = meRes.status === "fulfilled" ? meRes.value : null;
    const myMenus = menusRes.status === "fulfilled" ? menusRes.value : [];
    setMe(meData);
    setMenus(myMenus);

    if (hasFullAccess(meData)) {
      const [usersResult, rolesResult, workflowsResult] = await Promise.allSettled([
        fetchUsers(),
        fetchRoles(),
        fetchWorkflows(),
      ]);

      const users = usersResult.status === "fulfilled" ? usersResult.value : [];
      const roles = rolesResult.status === "fulfilled" ? rolesResult.value : [];
      const workflows = workflowsResult.status === "fulfilled" ? workflowsResult.value : [];
      const active = users.filter((u) => u.is_active).length;
      const stages = workflows.reduce((n, w) => n + (w.stages?.length ?? 0), 0);

      setStats([
        {
          label: "Total users",
          value: users.length,
          hint: `${users.length - active} inactive`,
          icon: Users,
          tone: TONES.sky,
          href: "/access-control/user-management",
        },
        {
          label: "Active users",
          value: active,
          hint: users.length ? `${Math.round((active / users.length) * 100)}% of all users` : "No users yet",
          icon: UserCheck,
          tone: TONES.emerald,
          href: "/access-control/user-management",
        },
        {
          label: "Roles",
          value: roles.length,
          hint: `${roles.filter((r) => r.is_active).length} active`,
          icon: Shield,
          tone: TONES.amber,
          href: "/access-control/role-management",
        },
        {
          label: "Workflows",
          value: workflows.length,
          hint: `${stages} stage${stages === 1 ? "" : "s"} in total`,
          icon: Workflow,
          tone: TONES.violet,
          href: "/access-control/workflow-management",
        },
      ]);
      setRoleBreakdown(usersByRole(users));
    } else {
      setStats([
        {
          label: "Screens you can open",
          value: myMenus.length,
          hint: "Granted to your role",
          icon: LayoutDashboard,
          tone: TONES.sky,
        },
        {
          label: "Processes",
          value: new Set(myMenus.map((m) => m.process_id).filter((id) => id != null)).size,
          hint: "Groups in your sidebar",
          icon: Layers,
          tone: TONES.violet,
        },
      ]);
    }
    setLoading(false);
  }

  if (loading) return <DashboardSkeleton />;

  const quickActions: QuickAction[] = [
    ...(isAdmin ? ADMIN_ACTIONS : []),
    ...menus
      // Not this page itself, and nothing already listed above.
      .filter((m) => !DASHBOARD_PATHS.includes(m.url) && !ADMIN_ACTIONS.some((a) => a.href === m.url))
      .map((m) => ({
        label: m.name,
        href: m.url,
        group: m.process?.name ?? "Screens",
        icon: getScreenIcon(m.name, m.url, m.icon),
      })),
  ];

  const now = new Date();
  const firstName = (me?.employee_name || me?.employee_id || "").trim().split(/\s+/)[0];
  const activeTotal = roleBreakdown.reduce((n, r) => n + r.count, 0);

  return (
    <PageContainer>
      {/* ── Welcome ── */}
      <section className="glass-card rounded-[22px] relative overflow-hidden p-5 sm:p-7">
        {/* soft brand glow in the corner; decorative only */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-[#00c6ff]/30 to-[#0072ff]/10 blur-3xl"
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 text-white bg-gradient-to-br from-[#00c6ff] to-[#0072ff] shadow-[0_0_24px_rgba(0,198,255,0.45)]">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5 truncate">
                {greeting(now)}
                {firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isAdmin ? "Here's how your workspace looks today." : "Pick a screen below to get started."}
              </p>
            </div>
          </div>
          {me?.role?.name && (
            <span className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              {me.role.name}
              {isAdmin && " · Full access"}
            </span>
          )}
        </div>
      </section>

      {/* ── Stats ── */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${stats.length > 2 ? "xl:grid-cols-4" : ""}`}>
        {stats.map(({ label, value, hint, icon: Icon, tone, href }) => {
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}>
                  <Icon className="w-5 h-5" />
                </div>
                {href && (
                  <ArrowUpRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-sky-500 transition-colors" />
                )}
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">{value}</p>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">{label}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{hint}</p>
            </>
          );
          const cls = "group glass-card rounded-2xl p-5 block";
          return href ? (
            <Link key={label} to={href} className={`${cls} glass-lift hover:border-sky-500/40`}>
              {body}
            </Link>
          ) : (
            <div key={label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      {/* ── Screens + role breakdown ── */}
      <div className={`grid grid-cols-1 gap-5 ${isAdmin ? "lg:grid-cols-3" : ""}`}>
        <section className={`glass-card rounded-2xl p-5 ${isAdmin ? "lg:col-span-2" : ""}`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Open a screen</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {quickActions.length} screen{quickActions.length === 1 ? "" : "s"} available to you
              </p>
            </div>
          </div>
          {quickActions.length === 0 ? (
            <EmptyState compact icon={LayoutDashboard} title="No screens yet" description="Screens you're given access to appear here." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {quickActions.map(({ label, href, group, icon: Icon }) => (
                <Link
                  key={href}
                  to={href}
                  className="group flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-200/70 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] hover:border-sky-500/40 hover:bg-sky-50/60 dark:hover:bg-sky-500/10 transition-colors"
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-sky-500/10 text-sky-600 dark:text-sky-400 group-hover:bg-gradient-to-br group-hover:from-[#00c6ff] group-hover:to-[#0072ff] group-hover:text-white transition-colors">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-sky-700 dark:group-hover:text-sky-300">
                      {label}
                    </span>
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">{group}</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-sky-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {isAdmin && (
          <section className="glass-card rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 dark:text-white text-sm">Active users by role</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 mb-4">Who can reach what, at a glance</p>
            {roleBreakdown.length === 0 ? (
              <EmptyState compact icon={Users} title="No active users" description="Add users in User Management." />
            ) : (
              <ul className="space-y-3.5">
                {roleBreakdown.slice(0, 6).map(({ name, count }) => (
                  <li key={name}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{name}</span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600"
                        style={{ width: `${Math.max(4, (count / activeTotal) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
                {roleBreakdown.length > 6 && (
                  <li className="text-[11px] text-slate-400 dark:text-slate-500">+{roleBreakdown.length - 6} more roles</li>
                )}
              </ul>
            )}
            <Link
              to="/access-control/menu-access"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
            >
              Manage screen access
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </section>
        )}
      </div>
    </PageContainer>
  );
}
