import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
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
import { ICON_MAP } from "@/lib/icons";
import { fetchMenus, type MenuItem } from "@/services/menu";
import PulseLogo from "@/components/PulseLogo";
import { useLive } from "@/context/LiveContext";
import { API_BASE_URL } from "@/lib/constants";
import { useReportPageLoading } from "@/context/PageLoadingContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// Mirrors backend/app/core/builtin_screens.py's built-in access-control screens. A group made up only of
// these (whatever it is, or isn't, grouped under in the database) is shown as the fixed "Access Control"
// section, so this never depends on how that process happens to be named or whether it has been migrated.
const ADMIN_SCREEN_URLS = new Set([
  "/access-control/user-management",
  "/access-control/role-management",
  "/access-control/menu-access",
  "/access-control/workflow-management",
]);

// A Developer's core navigation (also mirrors backend/app/core/builtin_screens.py) is hard-coded here, not
// read from /api/menus like everything else. A Developer must never lose Router Setup or Access Control --
// the very screens needed to fix the menus table -- just because that table is empty, misconfigured, or
// a process got renamed/deactivated by mistake. Any screen or process a Developer adds beyond these still
// comes from the database and shows alongside them (see visibleMenus below, which excludes these URLs so
// the database's own copies, once ensure_default_menus recreates them, don't render twice).
const DEV_DASHBOARD = { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard };
const DEV_ROUTER_SETUP = { href: "/developer-management/process-screen", label: "Router Setup", Icon: Layers };
const DEV_ACCESS_CONTROL: FlyoutItem[] = [
  { href: "/access-control/role-management", label: "Role Management", Icon: Shield },
  { href: "/access-control/user-management", label: "User Management", Icon: Users },
  { href: "/access-control/menu-access", label: "Menu Access", Icon: ShieldCheck },
  { href: "/access-control/workflow-management", label: "Workflow Management", Icon: Network },
];
const BUILT_IN_URLS = new Set([DEV_DASHBOARD.href, DEV_ROUTER_SETUP.href, ...DEV_ACCESS_CONTROL.map((i) => i.href)]);

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

export function getScreenIcon(name: string, url: string, iconKey?: string | null): React.ElementType {
  // Screens carry their own icon key from the backend (backend/app/core/builtin_screens.py sets it for the
  // built-in ones). A URL/name guess below only covers a screen with no icon key, or one ICON_MAP doesn't have.
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
  // Below the `lg` breakpoint the sidebar is an off-canvas drawer instead of the desktop collapse/expand
  // rail; these two control that drawer, and `collapsed` (the desktop behavior) is ignored while it's used.
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
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
          <Icon
            className={`w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110 ${active ? "text-sky-400 [html:not(.dark)_&]:text-[#0284c7]" : ""
              }`}
          />
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
          <div className="sidebar-flyout-in w-60 max-h-[inherit] overflow-y-auto rounded-2xl p-2 shadow-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1427]">
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
                  className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all duration-150 ${current
                    ? "bg-sky-200 text-sky-800 dark:bg-sky-500/30 dark:text-sky-200"
                    : "text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/25 hover:translate-x-0.5 hover:shadow-sm"
                    }`}
                >
                  <ItemIcon className="w-[18px] h-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110" />
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

export default function Sidebar({ collapsed: collapsedProp, loading = false, mobileOpen = false, onCloseMobile }: Props) {
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();

  // Below `lg`, the sidebar is always shown "expanded" (full labels) inside the off-canvas drawer --
  // the collapsed icon-rail + hover-flyout pattern is a desktop-only affordance (hover doesn't work on touch).
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const collapsed = isDesktop ? collapsedProp : false;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobile?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  const { accessVersion } = useLive();
  const [dynamicMenus, setDynamicMenus] = useState<MenuItem[]>([]);
  const [fetching, setFetching] = useState(true);
  // Despite the name, this is true for any superuser too, not just the Developer role (mirrors
  // has_full_access in backend/app/core/dependencies.py) -- both get the fully hardcoded nav below.
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [roleReady, setRoleReady] = useState(false);
  // The top bar's chrome (breadcrumb, hamburger, theme toggle, bell) waits on this too, so it never
  // looks "ready" while the sidebar underneath is still showing its own loading skeleton.
  useReportPageLoading("sidebar", loading || fetching || !roleReady);

  // Every custom screen/process still comes from /api/menus. For a Developer, the built-in screens are
  // hard-coded (see DEV_* above) instead, so the database's own copies of them -- once
  // ensure_default_menus has (re)created them -- are excluded here to avoid showing each one twice.
  const visibleMenus = isDeveloper ? dynamicMenus.filter((m) => !BUILT_IN_URLS.has(m.url)) : dynamicMenus;

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
      g.items.sort((a, b) => a.order - b.order || a.id - b.id);
      entries.push(sameName(g) ? { kind: "item", order: g.order, item: g.items[0] } : { kind: "group", order: g.order, group: g });
    }
    entries.sort((a, b) => a.order - b.order);
    // The built-in access-control screens (backend/app/core/builtin_screens.py) get their own
    // "Administration" section below the main menu, matching how it always looked when it was
    // hard-coded here. Detected by which screens the group holds, not by the process's name (whatever
    // that process is called -- "Administration" before the screens are migrated into it, "Access
    // Control" after -- still groups and labels the same way, and a role granted only some of these
    // screens still gets the section).
    const isAccessControl = (e: MenuEntry) =>
      e.kind === "group" && e.group.items.length > 0 && e.group.items.every((i) => ADMIN_SCREEN_URLS.has(i.url));
    return {
      entries: entries.filter((e) => !isAccessControl(e)),
      administration: entries.filter(isAccessControl),
    };
  })();

  const [processChoice, setProcessChoice] = useState<Record<number, boolean>>({});

  const isGroupActive = (items: MenuItem[]) => items.some((i) => pathname === i.url || pathname.startsWith(i.url + "/"));
  const isProcessOpen = (g: { key: number; items: MenuItem[] }) => processChoice[g.key] ?? false;

  function toggleProcess(g: { key: number; items: MenuItem[] }) {
    setProcessChoice((prev) => ({ ...prev, [g.key]: !isProcessOpen(g) }));
  }

  const [adminOpen, setAdminOpen] = useState<boolean | null>(null);
  const [devOpen, setDevOpen] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/auth/me`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setIsDeveloper(Boolean(data?.is_superuser && data?.role?.name?.trim().toLowerCase() === "developer")))
      .catch(() => { })
      .finally(() => setRoleReady(true));

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
            : "font-medium border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/[0.06] hover:translate-x-0.5"
          }`}
      >
        <span
          className={`shrink-0 flex items-center justify-center w-5 h-5 transition-colors ${active
            ? "text-sky-400 [html:not(.dark)_&]:text-[#0284c7]"
            : "text-slate-400 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white"
            }`}
        >
          <Icon
            className={`w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110 ${active ? "scale-105" : ""}`}
          />
        </span>
        <span
          className={`overflow-hidden truncate transition-[opacity,max-width,margin] duration-200 ease-out whitespace-nowrap ${collapsed ? "opacity-0 max-w-0 ml-0" : "opacity-100 max-w-[180px] flex-1"
            }`}
        >
          {label}
        </span>
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
            <Icon className="w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110" />
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
    <>
      {/* Backdrop: only below `lg`, where the sidebar is an off-canvas drawer over the page content. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside
        className={`shrink-0 flex flex-col justify-between rounded-[24px] transition-all duration-300 glass-panel p-3 select-none ${isDesktop
          ? "static h-full"
          : `fixed z-40 top-2 left-2 bottom-2 sm:top-3.5 sm:left-3.5 sm:bottom-3.5 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`
          }`}
        style={{
          width: collapsed ? 76 : 260,
        }}
      >
      {/* ── Top Logo ── */}
      <div className="w-full px-2 py-2 flex items-center justify-center">
        {loading || fetching || !roleReady ? (
          <div
            className={`rounded-lg bg-slate-200 dark:bg-white/10 animate-pulse ${collapsed ? "h-[30px] w-12" : "h-11 w-[118px]"}`}
            aria-hidden="true"
          />
        ) : (
          <PulseLogo collapsed={collapsed} />
        )}
      </div>
      {/* Underline: fades out at both ends in the template colours */}
      <div className="mx-3 mt-1 mb-3 h-px bg-gradient-to-r from-transparent via-[#0084ff]/40 to-transparent" />

      {/* ── Nav Items Scroll Area ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-1">
        {loading || fetching || !roleReady ? (
          <div className="space-y-2.5 py-1 px-1">
            {/* Section 1: Developer */}
            {!collapsed && (
              <div className="px-3 pt-1 pb-0.5">
                <div className="h-2 w-16 bg-slate-200/80 dark:bg-white/10 rounded animate-pulse" />
              </div>
            )}
            <div className={`flex items-center px-3 py-2 rounded-xl gap-3 animate-pulse bg-white/30 dark:bg-white/[0.03] ${collapsed ? "justify-center" : ""}`}>
              <div className="w-5 h-5 rounded-md bg-slate-200 dark:bg-white/10 shrink-0" />
              {!collapsed && <div className="h-3.5 w-36 bg-slate-200 dark:bg-white/10 rounded" />}
            </div>

            {/* Section 2: Main menu */}
            {!collapsed && (
              <div className="px-3 pt-1.5 pb-0.5">
                <div className="h-2 w-16 bg-slate-200/80 dark:bg-white/10 rounded animate-pulse" />
              </div>
            )}
            <div className={`flex items-center px-3 py-2 rounded-xl gap-3 animate-pulse bg-white/30 dark:bg-white/[0.03] ${collapsed ? "justify-center" : ""}`}>
              <div className="w-5 h-5 rounded-md bg-slate-200 dark:bg-white/10 shrink-0" />
              {!collapsed && <div className="h-3.5 w-24 bg-slate-200 dark:bg-white/10 rounded" />}
            </div>

            {/* Section 3: Administration */}
            {!collapsed && (
              <div className="px-3 pt-1.5 pb-0.5">
                <div className="h-2 w-24 bg-slate-200/80 dark:bg-white/10 rounded animate-pulse" />
              </div>
            )}
            <div className={`flex items-center px-3 py-2 rounded-xl gap-3 animate-pulse bg-white/30 dark:bg-white/[0.03] ${collapsed ? "justify-center" : ""}`}>
              <div className="w-5 h-5 rounded-md bg-slate-200 dark:bg-white/10 shrink-0" />
              {!collapsed && <div className="h-3.5 w-28 bg-slate-200 dark:bg-white/10 rounded" />}
            </div>
            {!collapsed && (
              <div className="mt-0.5 ml-4 pl-2.5 border-l border-slate-200/70 dark:border-white/10 space-y-1">
                {[64, 58, 52, 68].map((w, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-xl animate-pulse">
                    <div className="w-4 h-4 rounded bg-slate-200/70 dark:bg-white/10 shrink-0" />
                    <div className="h-3 bg-slate-200/70 dark:bg-white/10 rounded" style={{ width: `${w}%` }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Developer: Router Setup, hard-coded so a Developer always has it (see DEV_* above) */}
            {isDeveloper && (
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
                    active={pathname.startsWith("/developer-management")}
                    items={[DEV_ROUTER_SETUP]}
                  />
                ) : (
                  renderGroup(
                    "Developer Management",
                    Sparkles,
                    devOpen ?? false,
                    pathname.startsWith("/developer-management"),
                    () => setDevOpen(!(devOpen ?? false)),
                    renderItem(DEV_ROUTER_SETUP.href, DEV_ROUTER_SETUP.label, DEV_ROUTER_SETUP.Icon, true)
                  )
                )}
              </>
            )}

            {/* Main menu section */}
            {!collapsed && (isDeveloper || menuGroups.entries.length > 0) && (
              <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Main menu
              </p>
            )}

            {/* Dashboard: hard-coded for a Developer, same as Router Setup and Access Control below --
                never depends on the menus table having an active row for it (see DEV_* above). */}
            {isDeveloper && renderItem(DEV_DASHBOARD.href, DEV_DASHBOARD.label, DEV_DASHBOARD.Icon)}

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

            {/* Administration: for a Developer this is the hard-coded Access Control group (DEV_*
                above); for any other role it is whatever Menu Access granted (menuGroups.administration,
                detected by which screens a group holds -- see the ADMIN_SCREEN_URLS comment above). */}
            {(isDeveloper || menuGroups.administration.length > 0) && (
              <>
                {!collapsed && (
                  <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Administration
                  </p>
                )}
                {isDeveloper ? (
                  collapsed ? (
                    <FlyoutGroup
                      label="Access Control"
                      Icon={Lock}
                      active={DEV_ACCESS_CONTROL.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"))}
                      items={DEV_ACCESS_CONTROL}
                    />
                  ) : (
                    renderGroup(
                      "Access Control",
                      Lock,
                      adminOpen ?? false,
                      DEV_ACCESS_CONTROL.some((i) => pathname === i.href || pathname.startsWith(i.href + "/")),
                      () => setAdminOpen(!(adminOpen ?? false)),
                      DEV_ACCESS_CONTROL.map((i) => renderItem(i.href, i.label, i.Icon, true))
                    )
                  )
                ) : (
                menuGroups.administration.map((e) => {
                  if (e.kind !== "group") return null;
                  // Labelled "Access Control" regardless of what the underlying process is actually
                  // named in the database -- see the ADMIN_SCREEN_URLS comment above.
                  const label = "Access Control";
                  return collapsed ? (
                    <FlyoutGroup
                      key={e.group.key}
                      label={label}
                      Icon={Lock}
                      active={isGroupActive(e.group.items)}
                      items={e.group.items.map((i) => ({
                        href: i.url,
                        label: i.name,
                        Icon: getScreenIcon(i.name, i.url, i.icon),
                      }))}
                    />
                  ) : (
                    renderGroup(
                      label,
                      Lock,
                      isProcessOpen(e.group),
                      isGroupActive(e.group.items),
                      () => toggleProcess(e.group),
                      e.group.items.map((item) =>
                        renderItem(item.url, item.name, getScreenIcon(item.name, item.url, item.icon), true)
                      ),
                      e.group.key
                    )
                  );
                })
                )}
              </>
            )}
          </>
        )}
      </nav>

      {/* ── Logout Button at Bottom ── */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-white/[0.08]">
        {loading || fetching || !roleReady ? (
          <div
            className={`flex items-center px-3 py-2.5 rounded-xl w-full border border-slate-200/60 dark:border-white/5 bg-white/20 dark:bg-white/[0.02] animate-pulse ${collapsed ? "justify-center gap-0" : "gap-3"
              }`}
          >
            <div className="w-4 h-4 rounded bg-slate-200/80 dark:bg-white/10 shrink-0" />
            {!collapsed && <div className="h-3.5 w-16 bg-slate-200/80 dark:bg-white/10 rounded" />}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            className={`group flex items-center px-3 py-2.5 rounded-xl w-full text-[13.5px] font-medium transition-all duration-200 border border-slate-200/90 dark:border-slate-800 bg-white/30 dark:bg-[#0e172e]/60 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-900/50 hover:bg-rose-50/50 dark:hover:bg-rose-500/10 ${collapsed ? "justify-center gap-0" : "gap-3"
              }`}
          >
            <LogOut className="shrink-0 w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <span
              className={`overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200 ease-out ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[120px]"
                }`}
            >
              Logout
            </span>
          </button>
        )}
      </div>
      </aside>
    </>
  );
}
