"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";
import { clearToken, getToken } from "@/lib/auth";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  loading?: boolean;
}

interface UserInfo {
  employee_name: string | null;
  employee_id: string;
}

export default function TopBar({ collapsed, onToggle, loading = false }: Props) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setUser(data))
      .catch(() => {});
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
    router.push("/login");
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
      {/* Logo section — always 220px, never changes */}
      <div className="w-[220px] shrink-0 flex items-center justify-center h-full">
        {loading ? (
          <div className="h-8 w-28 bg-white/30 rounded-lg animate-pulse" />
        ) : (
          <Image
            src="/assets/logo.png"
            alt="Logo"
            width={110}
            height={36}
            className="h-8 w-auto object-contain brightness-0 invert"
            priority
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
        {loading ? (
          <div className="flex items-center gap-2.5 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-white/30" />
            <div className="hidden md:flex flex-col gap-1.5">
              <div className="h-3 w-28 bg-white/30 rounded" />
              <div className="h-2.5 w-16 bg-white/20 rounded" />
            </div>
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
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-white leading-tight">
                  {user?.employee_name ?? user?.employee_id ?? "User"}
                </p>
                <p className="text-xs text-white/60 leading-tight">{user?.employee_id}</p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-white/70 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown */}
            {open && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
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
    </header>
  );
}
