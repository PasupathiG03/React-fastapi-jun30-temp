import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Key,
  X,
  Menu,
  Moon,
  Sun,
  Bell,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";
import { clearToken, getToken } from "@/lib/auth";
import { changePasswordApi } from "@/services/auth";
import { useTheme } from "@/context/ThemeContext";
import { usePending } from "@/context/PendingContext";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  loading?: boolean;
}

interface UserInfo {
  employee_name: string | null;
  employee_id: string;
  role: { id: number; name: string } | null;
}

export default function TopBar({ onToggle, loading = false }: Props) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const pathname = location.pathname;
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const { stages: pendingStages, total: pendingTotal, pathFor, resolve } = usePending();
  const waiting = pendingStages.filter((s) => s.count > 0);
  const navigate = useNavigate();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setProfileLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setUser(data))
      .catch(() => { })
      .finally(() => setProfileLoading(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleLogout() {
    clearToken();
    navigate("/login");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    const token = getToken();
    if (!token) return;

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      await changePasswordApi(
        {
          old_password: oldPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        },
        token
      );
      setShowPasswordModal(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      alert("Password changed successfully! Please login with your new password.");
      handleLogout();
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setPasswordLoading(false);
    }
  }

  const initials = user?.employee_name
    ? user.employee_name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
    : user?.employee_id?.slice(0, 2).toUpperCase() ?? "EM";

  // Build breadcrumbs dynamically from pathname
  const breadcrumbs = (() => {
    if (pathname === "/" || pathname === "/dashboard") {
      return [{ label: "Dashboard", isLast: true }];
    }
    if (pathname.startsWith("/access-control")) {
      const crumbs = [{ label: "Access Control", isLast: false }];
      if (pathname.includes("user-management")) crumbs.push({ label: "User Management", isLast: true });
      else if (pathname.includes("role-management")) crumbs.push({ label: "Role Management", isLast: true });
      else if (pathname.includes("menu-access")) crumbs.push({ label: "Menu Access", isLast: true });
      else crumbs[0].isLast = true;
      return crumbs;
    }
    if (pathname.startsWith("/developer-management")) {
      return [
        { label: "Developer Management", isLast: false },
        { label: "Router Setup", isLast: true },
      ];
    }
    if (pathname === "/workflow-management") {
      return [{ label: "Workflow Management", isLast: true }];
    }
    // /workflows/<workflow>/<stage>: show the real names instead of the address segments
    const stageRoute = pathname.match(/^\/workflows\/([^/]+)\/([^/]+)\/?$/);
    if (stageRoute) {
      const route = resolve(stageRoute[1], stageRoute[2]);
      const stage = route && pendingStages.find((s) => s.stage_id === route.stageId);
      return stage
        ? [
          { label: "Workflows", isLast: false },
          { label: stage.workflow_name, isLast: false },
          { label: stage.stage_name, isLast: true },
        ]
        : [{ label: "Workflows", isLast: true }];
    }
    // Generic fallback
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((s, idx) => ({
      label: s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      isLast: idx === segments.length - 1,
    }));
  })();

  return (
    <header className="relative z-40 h-14 w-full shrink-0 flex items-center justify-between px-4 rounded-2xl bg-white/90 dark:bg-[#0c1427]/85 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-colors duration-200">
      {/* Left: Hamburger menu + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggle}
          title="Toggle Sidebar"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs truncate">
          {breadcrumbs.map((crumb, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              {idx > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              )}
              <span
                className={`truncate ${crumb.isLast
                    ? "font-semibold text-slate-900 dark:text-white"
                    : "font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 cursor-default"
                  }`}
              >
                {crumb.label}
              </span>
            </div>
          ))}
        </nav>
      </div>

      {/* Right: Theme Toggle, Notifications, User Profile */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/70 dark:border-white/10 transition-colors shadow-sm"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Notification Bell: open items waiting in the stages this user can open */}
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            title="Notifications"
            aria-label={`Notifications${pendingTotal ? `, ${pendingTotal} waiting` : ""}`}
            onClick={() => setBellOpen((o) => !o)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/70 dark:border-white/10 relative transition-colors shadow-sm"
          >
            <Bell className="w-4 h-4" />
            {pendingTotal > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#0c1427]">
                {pendingTotal > 99 ? "99+" : pendingTotal}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-10 w-80 bg-white dark:bg-[#0c1427] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.08]">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Waiting for you</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {pendingTotal > 0 ? `${pendingTotal} open item${pendingTotal > 1 ? "s" : ""}` : "Nothing waiting right now"}
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto py-1.5">
                {waiting.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">You are all caught up.</p>
                ) : (
                  waiting.map((s) => (
                    <button
                      key={s.stage_id}
                      type="button"
                      onClick={() => {
                        setBellOpen(false);
                        navigate(pathFor(s.stage_id));
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{s.stage_name}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{s.workflow_name}</p>
                      </div>
                      <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px] font-bold flex items-center justify-center">
                        {s.count}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        {loading || profileLoading ? (
          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/20 animate-pulse" />
        ) : (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00d2ff] to-[#0072ff] text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                {initials}
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform ${open ? "rotate-180" : ""
                  }`}
              />
            </button>

            {/* Dropdown */}
            {open && (
              <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-[#0c1427] rounded-2xl shadow-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden z-50">
                <div className="flex items-start gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00d2ff] to-[#0072ff] text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {user?.employee_name ?? user?.employee_id ?? "User"}
                    </p>
                    {user?.employee_name && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {user.employee_id}
                      </p>
                    )}
                    {user?.role?.name && (
                      <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300">
                        {user.role.name}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setOpen(false);
                    setShowPasswordModal(true);
                  }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-b border-slate-100 dark:border-white/10"
                >
                  <Key className="w-4 h-4 text-slate-400" />
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Password Modal */}
      {showPasswordModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div
              className="bg-white dark:bg-[#0c1427] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transform transition-all p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Change Password</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordError("");
                  }}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                {passwordError && (
                  <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
                    {passwordError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-all"
                    placeholder="Enter current password"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-all"
                    placeholder="Enter new password"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-all"
                    placeholder="Confirm new password"
                    required
                  />
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 leading-tight">
                    Must be at least 6 characters and contain an alphabet letter and a symbol.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center disabled:opacity-70 shadow-sm"
                  >
                    {passwordLoading ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
}
