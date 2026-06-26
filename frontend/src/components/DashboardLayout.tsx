
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import { isAuthenticated } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    setLoading(false);
  }, [navigate]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} loading={loading} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={collapsed} loading={loading} />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
