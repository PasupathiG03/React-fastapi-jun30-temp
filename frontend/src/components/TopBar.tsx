
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Key, X } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";
import { clearToken, getToken } from "@/lib/auth";
import { changePasswordApi } from "@/services/auth";

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

export default function TopBar({ collapsed, onToggle, loading = false }: Props) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
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
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
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
      await changePasswordApi({
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      }, token);
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
    ? user.employee_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : user?.employee_id?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <header
      className="flex h-16 w-full shrink-0 items-center"
      style={{
        background: "linear-gradient(150deg, #1d55e8 0%, #1440c8 55%, #1235b0 100%)",
        boxShadow: "0 4px 12px rgba(18, 53, 176, 0.45)",
      }}
    >
      {/* Logo section — matches Sidebar's expanded width */}
      <div className="w-[260px] shrink-0 flex items-center justify-center h-full">
        {loading ? (
          <div className="h-8 w-28 bg-white/30 rounded-lg animate-pulse" />
        ) : (
          <img
            src="/assets/logo.png"
            alt="Logo"
            width={110}
            height={36}
            className="h-8 w-auto object-contain brightness-0 invert"
          />
        )}
      </div>

      {/* Toggle — fixed at the gap between logo section and content */}
      <button
        onClick={onToggle}
        className="shrink-0 -mx-3.5 z-10 w-7 h-7 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center transition-colors"
      >
        {collapsed
          ? <ChevronRight className="w-4 h-4 text-white" />
          : <ChevronLeft  className="w-4 h-4 text-white" />
        }
      </button>

      {/* Content area — fills remaining space */}
      <div className="flex flex-1 items-center justify-end px-6">
        {loading || profileLoading ? (
          <div className="flex items-center gap-2.5 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-white/30" />
          </div>
        ) : (
          <div className="relative" ref={menuRef}>
            {/* Profile trigger */}
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-white/70 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown */}
            {open && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                <div className="flex items-start gap-2.5 px-4 py-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {user?.employee_name ?? user?.employee_id ?? "User"}
                    </p>
                    {user?.employee_name && (
                      <p className="text-xs text-gray-500 truncate">{user.employee_id}</p>
                    )}
                    {user?.role?.name && (
                      <span className="inline-block mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
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
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100"
                >
                  <Key className="w-4 h-4 text-gray-400" />
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
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
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transform transition-all p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-800">Change Password</h3>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError("");
                }}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                  {passwordError}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Current Password
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  placeholder="Enter current password"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  placeholder="Enter new password"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  placeholder="Confirm new password"
                  required
                />
                <p className="text-[10px] text-gray-400 mt-2 leading-tight">
                  Must be at least 6 characters and contain an alphabet letter and a symbol.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center disabled:opacity-70"
                >
                  {passwordLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Update Password"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
