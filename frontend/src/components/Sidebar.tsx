import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  GitBranch,
  Layers,
  LayoutDashboard,
  ShieldCheck,
  Lock,
  LogOut,
  Shield,
  Users,
  Network,
  Sparkles,
} from "lucide-react";
import { Cog } from "flowbite-react-icons/outline";
import { logout } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";
import { ICON_MAP } from "@/lib/icons";
import { fetchMenus, type MenuItem } from "@/services/menu";
import { fetchMyStages, type MyWorkflow } from "@/services/workflow";
import PulseLogo from "@/components/PulseLogo";
import { usePending } from "@/context/PendingContext";
import { useLive } from "@/context/LiveContext";
import { buildStageRoutes } from "@/lib/slug";
import { getStageIcon } from "@/lib/stageIcons";

// Screens a Developer always gets from the hard-coded entries below, so the database copies are skipped.
const STATIC_ADMIN_URLS = ["/dashboard", "/developer-management/process-screen"];

export function getProcessIcon(name: string): React.ElementType {
  const n = name.trim().toLowerCase();
  if (n.includes("workflow")) return Network;
  if (n.includes("access") || n.includes("admin")) return Lock;
  if (n.includes("developer") || n.includes("dev")) return Sparkles;
  if (n.includes("user") || n.includes("employee")) return Users;
  if (n.includes("role") || n.includes("permission")) return Shield;
  if (n.includes("dashboard")) return LayoutDashboard;
  return Layers;
}

// The built-in admin screens always use the same icons as the hard-coded Developer menu, so a user
// who sees them from the database gets exactly the same look (the stored icon key can point at a
// different icon set, which made the two differ).
const BUILT_IN_SCREEN_ICONS: Record<string, React.ElementType> = {
  "/access-control/user-management": Users,
  "/access-control/role-management": Shield,
  "/access-control/menu-access": ShieldCheck,
  "/developer-management/process-screen": Layers,
  "/workflow-management": Network,
  "/dashboard": LayoutDashboard,
};

export function getScreenIcon(name: string, url: string, iconKey?: string | null): React.ElementType {
  const builtIn = BUILT_IN_SCREEN_ICONS[url.trim().toLowerCase()];
  if (builtIn) return builtIn;
  if (iconKey && ICON_MAP[iconKey]) return ICON_MAP[iconKey];

  const lowerName = name.trim().toLowerCase();
  const lowerUrl = url.trim().toLowerCase();

  if (lowerUrl.includes("user-management") || lowerName.includes("user")) return Users;
  if (lowerUrl.includes("role-management") || lowerName.includes("role")) return Shield;
  if (lowerUrl.includes("menu-access") || lowerName.includes("access") || lowerName.includes("permission")) return ShieldCheck;
  if (lowerUrl.includes("workflow") || lowerName.includes("workflow")) return Network;
  if (lowerUrl.includes("process-screen") || lowerName.includes("process") || lowerName.includes("screen")) return Layers;
  if (lowerUrl.includes("dashboard") || lowerName.includes("dashboard")) return LayoutDashboard;

  return Cog;
}

interface Props {
  collapsed: boolean;
  loading?: boolean;
}

interface FlyoutItem {
  href: string;
  label: string;
  Icon: React.ElementType;
  badge?: number;
}

// Collapsed sidebar: a group shows as one icon; hovering it opens a panel to the right listing its
// sub-menus. The panel is fixed-positioned because the nav area clips overflow.
function FlyoutGroup({
  label,
  Icon,
  active,
  items,
}: {
  label: string;
  Icon: React.ElementType;
  active: boolean;
  items: FlyoutItem[];
}) {
  const { pathname } = useLocation();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; gap: number } | null>(null);

  const show = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // The panel starts at the button and its transparent left padding spans the rest of the
      // sidebar plus a visible gap, so there is no dead zone that would close it mid-move.
      const edge = btnRef.current?.closest("aside")?.getBoundingClientRect().right ?? r.right;
      setPos({ top: r.top, left: r.right, gap: edge - r.right + 16 });
    }
  };
  const hide = () => setPos(null);

  // Close after navigating so the panel doesn't linger over the new page.
  useEffect(hide, [pathname]);

  return (
    <div className="mx-1 mb-1" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        className={`group flex items-center justify-center px-2 py-2 rounded-xl w-full border border-transparent transition-all duration-200 ${active || pos
          ? "text-slate-900 dark:text-white bg-slate-100/70 dark:bg-white/[0.06]"
          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/[0.06]"
          }`}
      >
        <span className="flex items-center justify-center w-5 h-5">
          <Icon className={`w-[18px] h-[18px] ${active ? "text-sky-400 [html:not(.dark)_&]:text-[#0284c7]" : ""}`} />
        </span>
      </button>
      {pos &&
        createPortal(
        // The left padding is a transparent bridge so the pointer can cross the gap without closing the panel.
        <div
          role="menu"
          className="fixed z-[1000]"
          style={{ top: pos.top, left: pos.left, paddingLeft: pos.gap, maxHeight: `calc(100vh - ${pos.top}px - 8px)` }}
        >
          <div className="w-60 max-h-[inherit] overflow-y-auto rounded-2xl p-2 shadow-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1427]">
            <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {label}
            </p>
            {items.map(({ href, label: text, Icon: ItemIcon, badge = 0 }) => {
              const current = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
              return (
                <Link
                  key={href}
                  to={href}
                  role="menuitem"
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all duration-150 ${current
                    ? "bg-sky-200 text-sky-800 dark:bg-sky-500/30 dark:text-sky-200"
                    : "text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/25 hover:translate-x-0.5 hover:shadow-sm"
                    }`}
                >
                  <ItemIcon className="w-[18px] h-[18px] shrink-0" />
                  <span className="truncate flex-1">{text}</span>
                  {badge > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, loading = false }: Props) {
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();

  const { countFor } = usePending();
  const { accessVersion } = useLive();
  const [dynamicMenus, setDynamicMenus] = useState<MenuItem[]>([]);
  const [myWorkflows, setMyWorkflows] = useState<MyWorkflow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [roleReady, setRoleReady] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Expand/collapse choices live only in memory: every group starts closed after a refresh.
  // The group of the current page is still highlighted via its "active" state.
  const accessActive = pathname.startsWith("/access-control");
  const devMgmtActive = pathname.startsWith("/developer-management");
  const [accessChoice, setAccessChoice] = useState<boolean | null>(null);
  const [devChoice, setDevChoice] = useState<boolean | null>(null);
  const accessControlOpen = accessChoice ?? false;
  const devMgmtOpen = devChoice ?? false;
  const toggleAccessControl = () => setAccessChoice(!accessControlOpen);
  const toggleDevMgmt = () => setDevChoice(!devMgmtOpen);

  const [skeletonRows, setSkeletonRows] = useState(() => {
    try {
      const n = Number(localStorage.getItem("sidebar:rowCount"));
      return n >= 1 && n <= 20 ? n : 4;
    } catch {
      return 4;
    }
  });

  const visibleMenus =
    userRole === "Developer"
      ? dynamicMenus.filter(
          (m) =>
            !STATIC_ADMIN_URLS.includes(m.url) &&
            !m.url.startsWith("/access-control") &&
            m.url !== "/workflow-management"
        )
      : dynamicMenus;

  // Developers always get the hard-coded Access Control (User, Role, Menu Access) and Workflow Management
  // entries, whatever screens are registered in the database. Other roles only see what Menu Access grants.
  const showFallbackAccess = userRole === "Developer";
  const showFallbackWorkflow = userRole === "Developer";

  // Main menus in the order set on each process (screens without a process come first).
  type MenuEntry =
    | { kind: "item"; order: number; item: MenuItem }
    | { kind: "group"; order: number; group: { key: number; name: string; items: MenuItem[] } };

  const menuGroups = (() => {
    const groups: { key: number; name: string; order: number; items: MenuItem[] }[] = [];
    const entries: MenuEntry[] = [];
    for (const m of visibleMenus) {
      if (m.process_id == null) {
        entries.push({ kind: "item", order: 0, item: m });
        continue;
      }
      let g = groups.find((x) => x.key === m.process_id);
      if (!g) {
        g = { key: m.process_id, name: m.process?.name ?? "Process", order: m.process?.order ?? 9999, items: [] };
        groups.push(g);
      }
      g.items.push(m);
    }
    // A process whose only screen has the same name (e.g. process "Workflow Management" containing the
    // screen "Workflow Management") would show a pointless group with one identical sub-menu.
    // Show that screen as a single top-level item instead.
    const sameName = (g: { name: string; items: MenuItem[] }) =>
      g.items.length === 1 && g.items[0].name.trim().toLowerCase() === g.name.trim().toLowerCase();
    for (const g of groups) {
      entries.push(sameName(g) ? { kind: "item", order: g.order, item: g.items[0] } : { kind: "group", order: g.order, group: g });
    }
    entries.sort((a, b) => a.order - b.order);
    const flatOrder = entries.flatMap((e) => (e.kind === "item" ? [e.item] : e.group.items));
    return {
      entries,
      flatOrder,
      loose: entries.filter((e) => e.kind === "item"),
      groups: entries.filter((e) => e.kind === "group"),
    };
  })();

  const [processChoice, setProcessChoice] = useState<Record<number, boolean>>({});

  const isGroupActive = (items: MenuItem[]) => items.some((i) => pathname === i.url || pathname.startsWith(i.url + "/"));
  const isProcessOpen = (g: { key: number; items: MenuItem[] }) => processChoice[g.key] ?? false;

  function toggleProcess(g: { key: number; items: MenuItem[] }) {
    setProcessChoice((prev) => ({ ...prev, [g.key]: !isProcessOpen(g) }));
  }

  // Workflow groups: each workflow is a group, its stages (names come from the database) are sub-menus.
  // Addresses come from this component's own workflow list (not from the pending-counts request), so
  // every stage always has its own unique address. Using a shared fallback like "/dashboard" while the
  // other request was still loading gave all stages the same React key and duplicated the rows.
  const stageRoutes = useMemo(
    () =>
      buildStageRoutes(
        myWorkflows.flatMap((w) =>
          w.stages.map((s) => ({
            workflow_id: w.id,
            workflow_name: w.name,
            stage_id: s.id,
            stage_name: s.name,
            stage_type: s.stage_type,
            sequence_order: s.sequence_order,
            count: 0,
          }))
        )
      ),
    [myWorkflows]
  );
  const stagePath = (_w: MyWorkflow, stageId: number) =>
    stageRoutes.find((r) => r.stageId === stageId)?.path ?? `/workflows/stage-${stageId}`;
  const isWorkflowActive = (w: MyWorkflow) => w.stages.some((s) => pathname === stagePath(w, s.id));
  const isWorkflowOpen = (w: MyWorkflow) => processChoice[-w.id] ?? false;
  function toggleWorkflow(w: MyWorkflow) {
    setProcessChoice((prev) => ({ ...prev, [-w.id]: !isWorkflowOpen(w) }));
  }

  useEffect(() => {
    if (fetching || !roleReady) return;
    const isDev = userRole === "Developer";
    const adminRows = isDev
      ? collapsed
        ? 1 + 1 + 1
        : 1 + (devMgmtOpen ? 1 : 0) + 1 + (accessControlOpen ? 3 : 0) + 1
      : 0;
    const menuRows = collapsed
      ? menuGroups.entries.length
      : menuGroups.loose.length +
      menuGroups.groups.reduce((n, e) => (e.kind === "group" ? n + 1 + (isProcessOpen(e.group) ? e.group.items.length : 0) : n), 0);
    const workflowRows = collapsed
      ? myWorkflows.length
      : myWorkflows.reduce((n, w) => n + 1 + (isWorkflowOpen(w) ? w.stages.length : 0), 0);
    const rows = (isDev ? 1 : 0) + menuRows + workflowRows + adminRows;
    setSkeletonRows(rows);
    try {
      localStorage.setItem("sidebar:rowCount", String(rows));
    } catch {
      // ignore
    }
  }, [fetching, roleReady, userRole, visibleMenus.length, menuGroups.groups.length, myWorkflows, processChoice, pathname, collapsed, accessControlOpen]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/auth/me`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setUserRole(data.role?.name))
      .catch(() => { })
      .finally(() => setRoleReady(true));

    fetchMyStages()
      .then(setMyWorkflows)
      .catch(() => { });

    fetchMenus()
      .then(setDynamicMenus)
      .catch(() => { })
      .finally(() => setFetching(false));
  }, [accessVersion]);

  function handleLogout() {
    logout().finally(() => navigate("/login"));
  }

  const renderItem = (href: string, label: string, Icon: React.ElementType, indent = false, badge = 0) => {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

    return (
      <Link
        key={href}
        to={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center ${indent && !collapsed ? "ml-1" : "mx-1"} px-3 py-2 rounded-xl mb-1 transition-all duration-200 text-[13.5px] border ${collapsed ? "justify-center gap-0 px-2" : "gap-3"
          } ${active
            ? "font-medium text-white dark:text-white bg-sky-500/15 border-sky-500/30 dark:bg-sky-500/20 dark:border-sky-500/30 text-[#0284c7] light:bg-[#e0f2fe] light:text-[#0284c7] light:border-transparent dark:shadow-[0_0_15px_rgba(14,165,233,0.15)] [html:not(.dark)_&]:bg-[#e0f2fe] [html:not(.dark)_&]:text-[#0284c7] [html:not(.dark)_&]:border-transparent [html:not(.dark)_&]:font-semibold"
            : "font-medium border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/[0.06]"
          }`}
      >
        <span
          className={`shrink-0 flex items-center justify-center w-5 h-5 transition-colors ${active
            ? "text-sky-400 [html:not(.dark)_&]:text-[#0284c7]"
            : "text-slate-400 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white"
            }`}
        >
          <Icon className="w-[18px] h-[18px]" />
        </span>
        {!collapsed && <span className="truncate flex-1">{label}</span>}
        {badge > 0 && (
          <span
            className={`min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ${collapsed ? "absolute -top-1 -right-1 ring-2 ring-white dark:ring-[#0c1427]" : ""
              }`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  const renderGroup = (
    label: string,
    Icon: React.ElementType,
    open: boolean,
    active: boolean,
    onToggle: () => void,
    children: React.ReactNode,
    key?: React.Key
  ) => {
    return (
      <div key={key} className="mx-1 mb-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          title={label}
          className={`group flex items-center gap-3 px-3 py-2 rounded-xl w-full text-[13.5px] font-medium border transition-all duration-200 ${active
            ? "text-slate-900 dark:text-white border-transparent bg-slate-100/60 dark:bg-white/[0.04]"
            : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/[0.06]"
            }`}
        >
          <span className="shrink-0 flex items-center justify-center w-5 h-5 text-slate-400 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white">
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <span className="flex-1 text-left truncate">{label}</span>
          <ChevronDown
            className={`shrink-0 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${open ? "" : "-rotate-90"
              }`}
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
        >
          <div className="overflow-hidden">
            <div className="mt-0.5 ml-4 pl-2.5 border-l border-slate-200 dark:border-white/10 space-y-0.5">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside
      className={`h-full shrink-0 flex flex-col justify-between rounded-[24px] transition-all duration-300 glass-panel p-3 select-none`}
      style={{
        width: collapsed ? 76 : 260,
      }}
    >
      {/* ── Top Logo ── */}
      <div className="w-full px-2 py-2 flex items-center justify-center">
        <PulseLogo collapsed={collapsed} />
      </div>
      {/* Underline: fades out at both ends in the template colours */}
      <div className="mx-3 mt-1 mb-3 h-px bg-gradient-to-r from-transparent via-[#0084ff]/40 to-transparent" />

      {/* ── Nav Items Scroll Area ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-1">
        {loading || fetching || !roleReady ? (
          <div className="space-y-2 py-2 px-1">
            {Array.from({ length: skeletonRows }, (_, i) => (
              <div
                key={i}
                className={`flex items-center px-3 py-2 rounded-xl gap-3 animate-pulse bg-white/30 dark:bg-white/[0.03] ${collapsed ? "justify-center" : ""
                  }`}
              >
                <div className="w-5 h-5 rounded-md bg-slate-200 dark:bg-white/10 shrink-0" />
                {!collapsed && (
                  <div
                    className="h-3.5 bg-slate-200 dark:bg-white/10 rounded"
                    style={{ width: `${50 + ((i * 35) % 40)}%` }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Developer Management: always first for Developers */}
            {userRole === "Developer" && (
              <>
                {!collapsed && (
                  <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Developer
                  </p>
                )}
                {collapsed ? (
                  <FlyoutGroup
                    label="Developer Management"
                    Icon={Sparkles}
                    active={devMgmtActive}
                    items={[{ href: "/developer-management/process-screen", label: "Router Setup", Icon: Layers }]}
                  />
                ) : (
                  renderGroup(
                    "Developer Management",
                    Sparkles,
                    devMgmtOpen,
                    devMgmtActive,
                    toggleDevMgmt,
                    renderItem("/developer-management/process-screen", "Router Setup", Layers, true)
                  )
                )}
              </>
            )}

            {/* Main menu section */}
            {!collapsed && (userRole === "Developer" || menuGroups.entries.length > 0) && (
              <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Main menu
              </p>
            )}

            {userRole === "Developer" &&
              renderItem("/dashboard", "Dashboard", LayoutDashboard)}

            {/* Dynamic menus */}
            {collapsed ? (
              menuGroups.entries.map((e) =>
                e.kind === "item" ? (
                  renderItem(e.item.url, e.item.name, getScreenIcon(e.item.name, e.item.url, e.item.icon))
                ) : (
                  <FlyoutGroup
                    key={e.group.key}
                    label={e.group.name}
                    Icon={getProcessIcon(e.group.name)}
                    active={isGroupActive(e.group.items)}
                    items={e.group.items.map((i) => ({
                      href: i.url,
                      label: i.name,
                      Icon: getScreenIcon(i.name, i.url, i.icon),
                    }))}
                  />
                )
              )
            ) : (
              <>
                {menuGroups.entries.map((e) =>
                  e.kind === "item"
                    ? renderItem(e.item.url, e.item.name, getScreenIcon(e.item.name, e.item.url, e.item.icon))
                    : renderGroup(
                      e.group.name,
                      getProcessIcon(e.group.name),
                      isProcessOpen(e.group),
                      isGroupActive(e.group.items),
                      () => toggleProcess(e.group),
                      e.group.items.map((item) =>
                        renderItem(item.url, item.name, getScreenIcon(item.name, item.url, item.icon), true)
                      ),
                      e.group.key
                    )
                )}
              </>
            )}

            {/* Administration section */}
            {(showFallbackAccess || showFallbackWorkflow) && (
              <>
                {!collapsed && (
                  <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Administration
                  </p>
                )}

                {showFallbackAccess &&
                  (collapsed ? (
                    <FlyoutGroup
                      label="Access Control"
                      Icon={Lock}
                      active={accessActive}
                      items={[
                        { href: "/access-control/user-management", label: "User Management", Icon: Users },
                        { href: "/access-control/role-management", label: "Role Management", Icon: Shield },
                        { href: "/access-control/menu-access", label: "Menu Access", Icon: ShieldCheck },
                      ]}
                    />
                  ) : (
                    renderGroup(
                      "Access Control",
                      Lock,
                      accessControlOpen,
                      accessActive,
                      toggleAccessControl,
                      <>
                        {renderItem("/access-control/user-management", "User Management", Users, true)}
                        {renderItem("/access-control/role-management", "Role Management", Shield, true)}
                        {renderItem("/access-control/menu-access", "Menu Access", ShieldCheck, true)}
                      </>
                    )
                  ))}

                {showFallbackWorkflow && renderItem("/workflow-management", "Workflow Management", Network)}
              </>
            )}

            {/* Workflow stages the user's role may open */}
            {myWorkflows.length > 0 && (
              <>
                {!collapsed && (
                  <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Workflows
                  </p>
                )}
                {collapsed
                  ? myWorkflows.map((w) => (
                    <FlyoutGroup
                      key={`wf-${w.id}`}
                      label={w.name}
                      Icon={GitBranch}
                      active={isWorkflowActive(w)}
                      items={w.stages.map((s) => ({
                        href: stagePath(w, s.id),
                        label: s.name,
                        Icon: getStageIcon(s.stage_type),
                        badge: countFor(s.id),
                      }))}
                    />
                  ))
                  : myWorkflows.map((w) =>
                    renderGroup(
                      w.name,
                      GitBranch,
                      isWorkflowOpen(w),
                      isWorkflowActive(w),
                      () => toggleWorkflow(w),
                      w.stages.map((s) => renderItem(stagePath(w, s.id), s.name, getStageIcon(s.stage_type), true, countFor(s.id))),
                      `wf-${w.id}`
                    )
                  )}
              </>
            )}
          </>
        )}
      </nav>

      {/* ── Logout Button at Bottom ── */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={`flex items-center px-3 py-2.5 rounded-xl w-full text-[13.5px] font-medium transition-all duration-200 border border-slate-200/90 dark:border-slate-800 bg-white/30 dark:bg-[#0e172e]/60 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-900/50 hover:bg-rose-50/50 dark:hover:bg-rose-500/10 ${collapsed ? "justify-center gap-0" : "gap-3"
            }`}
        >
          <LogOut className="shrink-0 w-4 h-4" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
