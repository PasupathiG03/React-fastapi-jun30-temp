import { Suspense } from "react";
import { Toaster } from "react-hot-toast";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import AccessGuard from "./components/AccessGuard";
import DashboardLayout from "./components/DashboardLayout";
import RouteLoader from "./components/RouteLoader";
import TopProgressBar from "./components/TopProgressBar";
import { ThemeProvider } from "./context/ThemeContext";

import { Login, PAGE_ROUTES } from "./lib/lazyPages";

// The layout is a parent route, so the sidebar, top bar and live connection stay mounted while the
// user moves between pages (only the page content changes) instead of loading again every time.
function AppLayout() {
  const location = useLocation();
  return (
    <DashboardLayout>
      <Suspense fallback={<RouteLoader />}>
        {/* Limited roles: only granted screens, one tab (see AccessGuard). Full access: everything. */}
        <AccessGuard>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="h-full flex-1"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </AccessGuard>
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
        <Routes>
          <Route
            path="/login"
            element={
              <Suspense fallback={null}>
                <Login />
              </Suspense>
            }
          />

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
      </BrowserRouter>
    </ThemeProvider>
  );
}
