"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, LogOut, Users } from "lucide-react";
import { Cog } from "flowbite-react-icons/outline";
import { clearToken, getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";
import { ICON_MAP } from "@/lib/icons";
import { fetchMenus, type MenuItem } from "@/services/menu";

const float = (y: number[], duration: number, delay = 0) => ({
  animate: { y },
  transition: { duration, delay, repeat: Infinity, ease: "easeInOut" as const },
});

interface Props {
  collapsed: boolean;
  loading?: boolean;
}

export default function Sidebar({ collapsed, loading = false }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [dynamicMenus, setDynamicMenus] = useState<MenuItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      fetch(`${API_BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setUserRole(data.role?.name))
        .catch(() => {});
    }

    fetchMenus()
      .then(setDynamicMenus)
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  function NavLink({
    href,
    label,
    Icon,
  }: {
    href: string;
    label: string;
    Icon: React.ElementType;
  }) {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={`flex items-center mx-2 px-3 py-2.5 rounded-lg mb-0.5 transition-all text-sm font-medium
          ${collapsed ? "justify-center gap-0" : "gap-3"}
          ${
            active
              ? "bg-white text-[#1440c8] shadow-md"
              : "text-white/80 hover:bg-white/15 hover:text-white"
          }`}
      >
        <Icon className="shrink-0 w-[18px] h-[18px]" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  }

  return (
    <aside
      className="relative flex flex-col h-full transition-all duration-300 shrink-0"
      style={{
        width: collapsed ? 64 : 220,
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
      <nav className="relative z-10 flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {(loading || fetching) ? (
          <div className="mx-2 animate-pulse space-y-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex items-center px-3 py-2.5 rounded-lg gap-3 ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <div className="w-[18px] h-[18px] rounded bg-white/30 shrink-0" />
                {!collapsed && <div className="h-3.5 w-20 bg-white/20 rounded" />}
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Static: Dashboard */}
            <NavLink href="/dashboard" label="Dashboard" Icon={LayoutDashboard} />

            {/* Dynamic menus */}
            {dynamicMenus.map((item) => {
              const Icon = ICON_MAP[item.icon] ?? Cog;
              return (
                <NavLink key={item.id} href={item.url} label={item.name} Icon={Icon} />
              );
            })}

            {/* Separator */}
            {!collapsed && (
              <div className="mx-4 my-2 border-t border-white/10" />
            )}

            {/* Static: Menu Management */}
            {userRole === "Developer" && (
              <NavLink href="/menu-management" label="Menu Management" Icon={Cog} />
            )}
          </>
        )}
      </nav>

      {/* ── Logout ── */}
      <div className="relative z-10 py-3 border-t border-white/10">
        {(loading || fetching) ? (
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
            className={`flex items-center mx-2 px-3 py-2.5 rounded-lg w-[calc(100%-16px)] text-sm font-medium text-white/70 hover:bg-white/15 hover:text-white transition-all
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
