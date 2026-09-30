
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronDown, Layers, LayoutDashboard, ShieldCheck, Lock, LogOut, Shield, Users, Workflow } from "lucide-react";
import { Cog } from "flowbite-react-icons/outline";
import { clearToken, getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";
import { ICON_MAP } from "@/lib/icons";
import { fetchMenus, type MenuItem } from "@/services/menu";

const float = (y: number[], duration: number, delay = 0) => ({
  animate: { y },
  transition: { duration, delay, repeat: Infinity, ease: "easeInOut" as const },
});

// Screens the Developer already gets from the hard-coded admin section below;
// hide their database copies so they are not listed twice.
const STATIC_ADMIN_URLS = ["/dashboard", "/access-control/user-management", "/access-control/role-management", "/access-control/menu-access", "/menu-management", "/workflow-management"];

interface Props {
  collapsed: boolean;
  loading?: boolean;
}

export default function Sidebar({ collapsed, loading = false }: Props) {
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();
  const [dynamicMenus, setDynamicMenus] = useState<MenuItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [roleReady, setRoleReady] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [accessControlOpen, setAccessControlOpen] = useState(() => {
    try {
      const stored = localStorage.getItem("sidebar:accessControlOpen");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  const [menuMgmtOpen, setMenuMgmtOpen] = useState(() => {
    try {
      const stored = localStorage.getItem("sidebar:menuMgmtOpen");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  function persistToggle(setter: React.Dispatch<React.SetStateAction<boolean>>, key: string) {
    setter((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // ignore — private/blocked storage just won't persist across reloads
      }
      return next;
    });
  }

  const toggleMenuMgmt = () => persistToggle(setMenuMgmtOpen, "sidebar:menuMgmtOpen");
  const toggleAccessControl = () => persistToggle(setAccessControlOpen, "sidebar:accessControlOpen");
  const accessActive = pathname.startsWith("/access-control");
  const menuMgmtActive = pathname.startsWith("/menu-management");
  const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

  /** Collapsible main menu: icon chip, label, rotating chevron, animated sub-menu. */
  function renderGroup(
    label: string,
    Icon: React.ElementType,
    open: boolean,
    active: boolean,
    onToggle: () => void,
    children: React.ReactNode,
    key?: React.Key
  ) {
    return (
      <div key={key} className="mx-3 mb-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          title={label}
          className={`group flex items-center gap-3 px-3 py-2 rounded-xl w-full text-[13.5px] font-medium border transition-all duration-200 ${focusRing} ${
            active
              ? "text-white bg-white/10 border-white/15"
              : "border-transparent text-white/80 hover:bg-white/10 hover:border-white/10 hover:text-white"
          }`}
        >
          <span
            className={`shrink-0 flex items-center justify-center w-8 h-8 -ml-1 rounded-lg transition-colors ${
              active ? "bg-white/20" : "bg-white/5 group-hover:bg-white/10"
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <span className="flex-1 text-left truncate">{label}</span>
          <ChevronDown className={`shrink-0 w-4 h-4 text-white/60 transition-transform duration-300 ${open ? "" : "-rotate-90"}`} />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        >
          <div className="overflow-hidden">
            <div className="mt-1 ml-[22px] pl-3 border-l border-white/15 space-y-0.5">{children}</div>
          </div>
        </div>
      </div>
    );
  }

  // Remember how many rows the sidebar rendered last time so the loading skeleton
  // matches it (a fixed count made the skeleton look nothing like the real menu).
  const [skeletonRows, setSkeletonRows] = useState(() => {
    try {
      const n = Number(localStorage.getItem("sidebar:rowCount"));
      return n >= 1 && n <= 20 ? n : 3;
    } catch {
      return 3;
    }
  });

  const visibleMenus =
    userRole === "Developer" ? dynamicMenus.filter((m) => !STATIC_ADMIN_URLS.includes(m.url)) : dynamicMenus;

  // Each process is a main menu; the screens the user may open are its sub-menus.
  // A process with no permitted screens simply does not appear.
  const menuGroups = (() => {
    const groups: { key: number; name: string; items: MenuItem[] }[] = [];
    const loose: MenuItem[] = [];
    for (const m of visibleMenus) {
      if (m.process_id == null) {
        loose.push(m);
        continue;
      }
      let g = groups.find((x) => x.key === m.process_id);
      if (!g) {
        g = { key: m.process_id, name: m.process?.name ?? "Process", items: [] };
        groups.push(g);
      }
      g.items.push(m);
    }
    return { groups, loose };
  })();

  // Explicit open/closed choices per process, persisted (the sidebar remounts on every
  // page change, so plain state would reset). With no choice yet, a process is open only
  // while one of its screens is the current page.
  const [processChoice, setProcessChoice] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("sidebar:processOpen") ?? "{}");
    } catch {
      return {};
    }
  });
  const isGroupActive = (items: MenuItem[]) => items.some((i) => pathname === i.url || pathname.startsWith(i.url));
  const isProcessOpen = (g: { key: number; items: MenuItem[] }) => processChoice[g.key] ?? isGroupActive(g.items);
  function toggleProcess(g: { key: number; items: MenuItem[] }) {
    setProcessChoice((prev) => {
      const next = { ...prev, [g.key]: !isProcessOpen(g) };
      try {
        localStorage.setItem("sidebar:processOpen", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  useEffect(() => {
    if (fetching || !roleReady) return;
    const isDev = userRole === "Developer";
    const adminRows = isDev ? (collapsed ? 3 : 1 + (accessControlOpen ? 3 : 0)) + 2 : 0;
    const menuRows = collapsed
      ? visibleMenus.length
      : menuGroups.loose.length + menuGroups.groups.reduce((n, g) => n + 1 + (isProcessOpen(g) ? g.items.length : 0), 0);
    const rows = (isDev ? 1 : 0) + menuRows + adminRows;
    setSkeletonRows(rows);
    try {
      localStorage.setItem("sidebar:rowCount", String(rows));
    } catch {
      // ignore
    }
  }, [fetching, roleReady, userRole, visibleMenus.length, menuGroups.groups.length, processChoice, pathname, collapsed, accessControlOpen]);

  useEffect(() => {
    const token = getToken();
    if (token) {
      fetch(`${API_BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setUserRole(data.role?.name))
        .catch(() => {})
        .finally(() => setRoleReady(true));
    } else {
      setRoleReady(true);
    }

    fetchMenus()
      .then(setDynamicMenus)
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  function handleLogout() {
    clearToken();
    navigate("/login");
  }

  function NavLink({
    href,
    label,
    Icon,
    indent = false,
  }: {
    href: string;
    label: string;
    Icon: React.ElementType;
    indent?: boolean;
  }) {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

    return (
      <Link
        to={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center ${indent && !collapsed ? "ml-2 mr-0" : "mx-3"} px-3 py-2 rounded-xl mb-1 transition-all duration-200 text-[13.5px] border ${focusRing}
          ${collapsed ? "justify-center gap-0" : "gap-3"}
          ${
            active
              ? "font-semibold text-white border-white/30 bg-gradient-to-r from-white/25 to-white/5 backdrop-blur-xl shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.4)]"
              : "font-medium border-transparent text-white/80 hover:bg-white/10 hover:border-white/10 hover:text-white"
          }`}
      >
        {active && (
          <span className={`absolute ${indent && !collapsed ? "left-0" : "-left-3"} top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-white shadow-[0_0_12px_rgba(255,255,255,1)]`} />
        )}
        <span
          className={`relative shrink-0 flex items-center justify-center w-8 h-8 ${collapsed ? "" : "-ml-1"} rounded-lg transition-all duration-200 ${
            active ? "bg-white text-[#1440c8] shadow-md" : "bg-white/5 group-hover:bg-white/10"
          }`}
        >
          <Icon className="w-[18px] h-[18px]" />
        </span>
        {!collapsed && <span className="relative truncate flex-1">{label}</span>}
      </Link>
    );
  }

  return (
    <aside
      className="relative flex flex-col h-full transition-all duration-300 shrink-0"
      style={{
        width: collapsed ? 76 : 272,
        background: "#1440c8",
      }}
    >
      {/* ── Floating shapes ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div className="absolute -top-4 -right-4" {...float([0, -10, 0], 3.5, 0.4)}>
          <svg width="90" height="90" viewBox="0 0 85 85" fill="none">
            <defs>
              <linearGradient id="sb_g1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6699ff" />
                <stop offset="100%" stopColor="#1a3ecc" />
              </linearGradient>
            </defs>
            <path
              d="M 42 8 A 34 34 0 1 1 8 42"
              stroke="url(#sb_g1)"
              strokeWidth="13"
              strokeLinecap="round"
              fill="none"
              opacity="0.55"
            />
          </svg>
        </motion.div>

        <motion.div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: "35%" }}
          {...float([0, -12, 0], 4.8, 0.5)}
        >
          <svg width="110" height="110" viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="sb_g2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6699ff" />
                <stop offset="100%" stopColor="#1a3ecc" />
              </linearGradient>
            </defs>
            <ellipse
              cx="50"
              cy="50"
              rx="38"
              ry="38"
              stroke="url(#sb_g2)"
              strokeWidth="14"
              fill="none"
              opacity="0.3"
            />
          </svg>
        </motion.div>

        <motion.div
          className="absolute -bottom-8 -left-6"
          {...float([0, -10, 0], 6, 0.5)}
        >
          <svg width="160" height="130" viewBox="0 0 270 210" fill="none">
            <defs>
              <linearGradient id="sb_g3" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6699ff" />
                <stop offset="100%" stopColor="#1a3ecc" />
              </linearGradient>
            </defs>
            <rect
              x="10"
              y="10"
              width="250"
              height="190"
              rx="45"
              stroke="url(#sb_g3)"
              strokeWidth="18"
              fill="url(#sb_g3)"
              fillOpacity="0.15"
              opacity="0.4"
            />
          </svg>
        </motion.div>

        <motion.div
          className="absolute -right-4 rotate-[18deg]"
          style={{ top: "52%" }}
          {...float([0, -16, 0], 5.5, 0.6)}
        >
          <svg width="70" height="160" viewBox="0 0 130 320" fill="none">
            <defs>
              <linearGradient id="sb_g4" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6699ff" />
                <stop offset="100%" stopColor="#1a3ecc" />
              </linearGradient>
            </defs>
            <ellipse
              cx="65"
              cy="58"
              rx="50"
              ry="32"
              stroke="url(#sb_g4)"
              strokeWidth="16"
              fill="none"
              opacity="0.4"
            />
            <ellipse
              cx="65"
              cy="262"
              rx="50"
              ry="32"
              stroke="url(#sb_g4)"
              strokeWidth="16"
              fill="none"
              opacity="0.3"
            />
          </svg>
        </motion.div>
      </div>

      {/* ── Nav Items ── */}
      <nav className="relative z-10 flex-1 py-4 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]">
        {(loading || fetching || !roleReady) ? (
          <div className="mx-2 animate-pulse space-y-1">
            {Array.from({ length: skeletonRows }, (_, i) => (
              <div
                key={i}
                className={`flex items-center px-3 py-2.5 rounded-xl gap-3 ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <div className="w-[18px] h-[18px] rounded bg-white/30 shrink-0" />
                {!collapsed && <div className="h-3.5 bg-white/20 rounded" style={{ width: `${55 + ((i * 37) % 35)}%` }} />}
              </div>
            ))}
          </div>
        ) : (
          <>
            {!collapsed && userRole === "Developer" && (
              <p className="px-6 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Main Menu
              </p>
            )}
            {/* Hard-coded menus are Developer-only; everyone else only sees the screens
                their role was granted in Menu Access (a Dashboard screen included). */}
            {userRole === "Developer" && <NavLink href="/dashboard" label="Dashboard" Icon={LayoutDashboard} />}

            {/* Dynamic menus: process = main menu, screens = sub-menus */}
            {collapsed
              ? visibleMenus.map((item) => (
                  <NavLink key={item.id} href={item.url} label={item.name} Icon={ICON_MAP[item.icon ?? ""] ?? Cog} />
                ))
              : (
                <>
                  {menuGroups.loose.map((item) => (
                    <NavLink key={item.id} href={item.url} label={item.name} Icon={ICON_MAP[item.icon ?? ""] ?? Cog} />
                  ))}
                  {menuGroups.groups.map((g) =>
                    renderGroup(
                      g.name,
                      Layers,
                      isProcessOpen(g),
                      isGroupActive(g.items),
                      () => toggleProcess(g),
                      g.items.map((item) => (
                        <NavLink key={item.id} href={item.url} label={item.name} Icon={ICON_MAP[item.icon ?? ""] ?? Cog} indent />
                      )),
                      g.key
                    )
                  )}
                </>
              )}

            {/* Static: Developer-only admin screens (always available, no process/screen setup needed) */}
            {userRole === "Developer" && (
              <>
                {collapsed ? (
                  <div className="mx-5 my-2 border-t border-white/15" />
                ) : (
                  <p className="flex items-center gap-3 px-6 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                    Administration
                    <span className="flex-1 border-t border-white/15" />
                  </p>
                )}
                {collapsed ? (
                  <>
                    <NavLink href="/access-control/user-management" label="User Management" Icon={Users} />
                    <NavLink href="/access-control/role-management" label="Role Management" Icon={Shield} />
                    <NavLink href="/access-control/menu-access" label="Menu Access" Icon={ShieldCheck} />
                  </>
                ) : (
                  renderGroup(
                    "Access Control",
                    Lock,
                    accessControlOpen,
                    accessActive,
                    toggleAccessControl,
                    <>
                      <NavLink href="/access-control/user-management" label="User Management" Icon={Users} indent />
                      <NavLink href="/access-control/role-management" label="Role Management" Icon={Shield} indent />
                      <NavLink href="/access-control/menu-access" label="Menu Access" Icon={ShieldCheck} indent />
                    </>
                  )
                )}
                {collapsed ? (
                  <NavLink href="/menu-management" label="Process & Screen" Icon={Cog} />
                ) : (
                  renderGroup(
                    "Developer Management",
                    Cog,
                    menuMgmtOpen,
                    menuMgmtActive,
                    toggleMenuMgmt,
                    <NavLink href="/menu-management" label="Process & Screen" Icon={Layers} indent />
                  )
                )}
                <NavLink href="/workflow-management" label="Workflow Management" Icon={Workflow} />
              </>
            )}
          </>
        )}
      </nav>

      {/* ── Logout ── */}
      <div className="relative z-10 p-3 border-t border-white/15 bg-white/5 backdrop-blur-md">
        {(loading || fetching || !roleReady) ? (
          <div
            className={`flex items-center mx-2 px-3 py-2.5 gap-3 animate-pulse ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div className="w-[18px] h-[18px] rounded bg-white/30 shrink-0" />
            {!collapsed && <div className="h-3.5 w-12 bg-white/20 rounded" />}
          </div>
        ) : (
          <button
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            className={`flex items-center px-3 py-2.5 rounded-xl w-full text-sm font-medium text-white/80 bg-white/10 border border-white/15 backdrop-blur-md hover:bg-red-500/30 hover:border-red-300/40 hover:text-white transition-all
              ${collapsed ? "justify-center gap-0" : "gap-3"}`}
          >
            <LogOut className="shrink-0 w-[18px] h-[18px]" />
            {!collapsed && <span>Logout</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
