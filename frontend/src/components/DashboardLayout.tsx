import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import { isAuthenticated } from "@/lib/auth";
import { useTheme } from "@/context/ThemeContext";
import { PendingProvider } from "@/context/PendingContext";
import SessionWatcher from "@/components/SessionWatcher";
import { LiveProvider } from "@/context/LiveContext";
import { PageLoadingProvider, usePageLoading } from "@/context/PageLoadingContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import Copyright from "@/components/Copyright";

function LayoutFooter({ loading }: { loading: boolean }) {
  const { pageLoading } = usePageLoading();
  return (
    <footer className="shrink-0 text-center pb-0.5">
      <Copyright loading={loading || pageLoading} className="text-xs text-slate-500 dark:text-slate-400" />
    </footer>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  // Below `lg` the sidebar is an off-canvas drawer (see Sidebar.tsx) instead of the desktop collapse rail.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    setLoading(false);
  }, [navigate]);

  // Close the drawer whenever the route changes, so it never lingers over the new page. Also reset
  // scroll to the top -- otherwise a page opened while scrolled down jumps straight into the middle
  // of the next one instead of starting at its top.
  useEffect(() => {
    setMobileNavOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  function handleToggleNav() {
    if (isDesktop) setCollapsed((c) => !c);
    else setMobileNavOpen((o) => !o);
  }

  return (
    <LiveProvider>
      <PendingProvider>
        <SessionWatcher />
        <div
          className="app-ambient flex h-screen w-screen overflow-hidden p-2 sm:p-3.5 gap-2 sm:gap-3.5 font-sans transition-colors duration-200"
          style={{
            background:
              theme === "dark"
                ? "radial-gradient(ellipse 65% 45% at 20% 5%, rgba(14, 165, 233, 0.12), transparent 70%), radial-gradient(ellipse 55% 45% at 90% 90%, rgba(2, 132, 199, 0.08), transparent 70%), #070c1e"
                : "linear-gradient(135deg, #eef4fc 0%, #e2edfd 50%, #d8e7fa 100%)",
          }}
        >
          {/* Both the sidebar and the top bar read/report into PageLoadingContext (the sidebar reports
              its own load; TopBar's chrome waits on every reporter), so both must be inside it. */}
          <PageLoadingProvider>
            {/* Floating Left Sidebar */}
            <Sidebar
              collapsed={collapsed}
              loading={loading}
              mobileOpen={mobileNavOpen}
              onCloseMobile={() => setMobileNavOpen(false)}
            />

            {/* Right Column: TopBar + Page Content */}
            <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden gap-3.5">
              <TopBar collapsed={collapsed} onToggle={handleToggleNav} loading={loading} />
              <main ref={mainRef} className="flex-1 overflow-y-auto pr-1 pb-6 min-w-0 [scrollbar-width:thin]">
                {children}
              </main>
              <LayoutFooter loading={loading} />
            </div>
          </PageLoadingProvider>
        </div>
      </PendingProvider>
    </LiveProvider>
  );
}
