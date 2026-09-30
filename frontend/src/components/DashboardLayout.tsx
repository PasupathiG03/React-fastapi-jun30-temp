import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import { isAuthenticated } from "@/lib/auth";
import { useTheme } from "@/context/ThemeContext";
import { PendingProvider } from "@/context/PendingContext";
import { LiveProvider } from "@/context/LiveContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    setLoading(false);
  }, [navigate]);

  return (
    <LiveProvider>
    <PendingProvider>
    <div
      className="flex h-screen w-screen overflow-hidden p-3.5 gap-3.5 font-sans transition-colors duration-200 select-none-text"
      style={{
        background:
          theme === "dark"
            ? "radial-gradient(ellipse 65% 45% at 20% 5%, rgba(14, 165, 233, 0.12), transparent 70%), radial-gradient(ellipse 55% 45% at 90% 90%, rgba(2, 132, 199, 0.08), transparent 70%), #070c1e"
            : "linear-gradient(135deg, #eef4fc 0%, #e2edfd 50%, #d8e7fa 100%)",
      }}
    >
      {/* Floating Left Sidebar */}
      <Sidebar collapsed={collapsed} loading={loading} />

      {/* Right Column: TopBar + Page Content */}
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden gap-3.5">
        <TopBar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} loading={loading} />
        <main className="flex-1 overflow-y-auto pr-1 pb-6 min-w-0 [scrollbar-width:thin]">
          {children}
        </main>
        <footer className="shrink-0 text-center text-xs text-slate-500 dark:text-slate-400 pb-0.5">
          &copy; 2026 MTPL. All rights reserved.
        </footer>
      </div>
    </div>
    </PendingProvider>
    </LiveProvider>
  );
}
