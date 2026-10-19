import { Suspense } from "react";
import { Toaster } from "react-hot-toast";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import RouteLoader from "./components/RouteLoader";
import TopProgressBar from "./components/TopProgressBar";
import { ThemeProvider } from "./context/ThemeContext";

import { DashboardLayout, Login, PAGE_ROUTES } from "./lib/lazyPages";

// The layout is a parent route, so the sidebar, top bar and live connection stay mounted while the
// user moves between pages (only the page content changes) instead of loading again every time.
function AppLayout() {
  const location = useLocation();
  return (
    <DashboardLayout>
      <Suspense fallback={<RouteLoader />}>
        {/* Keyed by path so the fade replays on every page change, not just the first mount */}
        <div key={location.pathname} className="route-fade-in h-full">
          <Outlet />
        </div>
      </Suspense>
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Toaster position="top-right" />
      <BrowserRouter>
        <TopProgressBar />
        <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<AppLayout />}>
            {/* Every screen comes from PAGE_ROUTES (src/lib/lazyPages.ts), so each one is lazy-loaded.
                Add new menus there, not here. Only redirects live below. */}
            {PAGE_ROUTES.map(({ path, page: Page }) => (
              <Route key={path} path={path} element={<Page />} />
            ))}

            {/* Redirects */}
            <Route path="/access-control" element={<Navigate to="/access-control/user-management" replace />} />
            <Route path="/developer-management" element={<Navigate to="/developer-management/router-setup" replace />} />
            <Route path="/developer-management/process" element={<Navigate to="/developer-management/router-setup" replace />} />
            <Route path="/developer-management/screen" element={<Navigate to="/developer-management/router-setup" replace />} />

            <Route path="/workflows/:workflowSlug/:stageSlug" element={<Navigate to="/access-control/workflow-management" replace />} />
            <Route path="/workflows/:workflowId/stages/:stageId" element={<Navigate to="/access-control/workflow-management" replace />} />
          </Route>

          {/* Old flat URLs still work */}
          <Route path="/menu-management" element={<Navigate to="/developer-management/router-setup" replace />} />
          <Route path="/user-management" element={<Navigate to="/access-control/user-management" replace />} />
          <Route path="/role-management" element={<Navigate to="/access-control/role-management" replace />} />
          <Route path="/workflow-management" element={<Navigate to="/access-control/workflow-management" replace />} />
          <Route path="/menu-access" element={<Navigate to="/access-control/menu-access" replace />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </ThemeProvider>
  );
}
