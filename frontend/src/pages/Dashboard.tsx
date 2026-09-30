
import { useEffect, useState } from "react";
import { BarChart2, Clock, Layers, LayoutDashboard, Shield, TrendingUp, UserCheck, Users, Workflow, ArrowUpRight } from "lucide-react";
import { fetchUsers } from "@/services/user";
import { fetchRoles } from "@/services/role";
import { fetchWorkflows } from "@/services/workflow";
import { fetchMenus, type MenuItem } from "@/services/menu";
import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

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
  { label: "Manage Users",     href: "/access-control/user-management"     },
  { label: "Manage Roles",     href: "/access-control/role-management"     },
  { label: "Manage Menus",     href: "/menu-management"     },
  { label: "Manage Workflows", href: "/workflow-management" },
];

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-7 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-28 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

function QuickActionSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
      {/* header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-4 rounded bg-gray-200" />
        <div className="h-4 w-24 bg-gray-200 rounded" />
      </div>
      {/* rows */}
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-100">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
      {/* header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-4 rounded bg-gray-200" />
        <div className="h-4 w-28 bg-gray-200 rounded" />
      </div>
      {/* rows */}
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-48 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stat[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const isAdmin = !!me && (me.is_superuser || me.role?.name === "Developer");

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const token = getToken();
    const [meRes, menusRes] = await Promise.allSettled([
      fetch(`${API_BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)),
      fetchMenus(),
    ]);
    const meData: Me | null = meRes.status === "fulfilled" ? meRes.value : null;
    const myMenus = menusRes.status === "fulfilled" ? menusRes.value : [];
    setMe(meData);
    setMenus(myMenus);

    const admin = !!meData && (meData.is_superuser || meData.role?.name === "Developer");
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
        { label: "Total Users", value: users.length, icon: Users, iconColor: "#1d55e8", bg: "#eff3fe" },
        {
          label: "Active Users",
          value: users.filter((u) => u.is_active).length,
          icon: UserCheck,
          iconColor: "#0ea575",
          bg: "#ecfdf5",
        },
        { label: "Total Roles", value: roles.length, icon: Shield, iconColor: "#f59e0b", bg: "#fffbeb" },
        { label: "Total Workflows", value: workflows.length, icon: Workflow, iconColor: "#8b5cf6", bg: "#f5f3ff" },
      ]);
    } else {
      // Regular users only see numbers about what they are allowed to open.
      setStats([
        { label: "Screens You Can Access", value: myMenus.length, icon: LayoutDashboard, iconColor: "#1d55e8", bg: "#eff3fe" },
        {
          label: "Processes",
          value: new Set(myMenus.map((m) => m.process_id).filter((id) => id != null)).size,
          icon: Layers,
          iconColor: "#8b5cf6",
          bg: "#f5f3ff",
        },
      ]);
    }
    setLoading(false);
  }

  // Admins get the built-in admin shortcuts; everyone gets the screens their role can open.
  const quickActions = [
    ...(isAdmin ? QUICK_ACTIONS : []),
    ...menus
      .filter((m) => !QUICK_ACTIONS.some((q) => q.href === m.url))
      .map((m) => ({ label: m.name, href: m.url })),
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: "linear-gradient(135deg, #1d55e8 0%, #1235b0 100%)" }}
      >
        <p className="text-blue-200 text-sm font-medium mb-1">
          Welcome back{me ? `, ${me.employee_name || me.employee_id}` : ""}
        </p>
        <h2 className="text-2xl font-bold">Workflow Platform</h2>
        <p className="text-blue-200 text-sm mt-1">
          {isAdmin
            ? "Manage users, roles, menus, and approval workflows from one place."
            : `Signed in${me?.role ? ` as ${me.role.name}` : ""}. Use the sidebar or the shortcuts below to open your screens.`}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading
          ? [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
          : stats.map(({ label, value, icon: Icon, iconColor, bg }) => (
              <div key={label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-6 h-6" style={{ color: iconColor }} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{value}</p>
                  <p className="text-sm text-gray-500">{label}</p>
                </div>
              </div>
            ))
        }
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {loading ? (
          <>
            <QuickActionSkeleton />
            <ActivitySkeleton />
          </>
        ) : (
          <>
            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-700 text-sm">Quick Actions</h3>
              </div>
              <div className="space-y-2">
                {quickActions.length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">
                    No screens assigned to your role yet. Ask an administrator to grant access.
                  </p>
                )}
                {quickActions.map(({ label, href }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all group"
                  >
                    <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{label}</span>
                    <ArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </a>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-700 text-sm">Recent Activity</h3>
              </div>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <BarChart2 className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">No activity yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Activity will show up here as changes are made.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
