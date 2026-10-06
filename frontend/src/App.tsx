import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout";
import RouteLoader from "./components/RouteLoader";
import { ThemeProvider } from "./context/ThemeContext";

// Every page is loaded on demand, so its code is only downloaded when the route is opened.
const Login = lazy(() => import("./pages/Login"));
const DashboardGate = lazy(() => import("./pages/DashboardGate"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));
const MenuAccess = lazy(() => import("./pages/MenuAccess"));
const MenuManagement = lazy(() => import("./pages/MenuManagement"));
const WorkflowManagement = lazy(() => import("./pages/WorkflowManagement"));

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
      <BrowserRouter>
        <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardGate />} />
            <Route path="/dashboard" element={<DashboardGate />} />

            {/* Access Control */}
            <Route path="/access-control" element={<Navigate to="/access-control/user-management" replace />} />
            <Route path="/access-control/user-management" element={<UserManagement />} />
            <Route path="/access-control/role-management" element={<RoleManagement />} />
            <Route path="/access-control/menu-access" element={<MenuAccess />} />
            <Route path="/access-control/workflow-management" element={<WorkflowManagement />} />

            {/* Developer Management */}
            <Route path="/developer-management" element={<Navigate to="/developer-management/router-setup" replace />} />
            <Route path="/developer-management/process" element={<Navigate to="/developer-management/router-setup" replace />} />
            <Route path="/developer-management/screen" element={<Navigate to="/developer-management/router-setup" replace />} />
            <Route path="/developer-management/router-setup" element={<MenuManagement />} />
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
