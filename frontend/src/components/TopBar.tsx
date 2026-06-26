"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

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
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-white leading-tight">
                {user?.employee_name ?? user?.employee_id ?? "User"}
              </p>
              <p className="text-xs text-white/60 leading-tight">{user?.employee_id}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
