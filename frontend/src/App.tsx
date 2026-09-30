import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./context/ThemeContext";

// Every page is loaded on demand, so its code is only downloaded when the route is opened.
const Login = lazy(() => import("./pages/Login"));
const DashboardGate = lazy(() => import("./pages/DashboardGate"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));
const MenuAccess = lazy(() => import("./pages/MenuAccess"));
const MenuManagement = lazy(() => import("./pages/MenuManagement"));
const WorkflowManagement = lazy(() => import("./pages/WorkflowManagement"));
const StageWorkspace = lazy(() => import("./pages/StageWorkspace"));
const LegacyStageRedirect = lazy(() => import("./pages/LegacyStageRedirect"));

// The layout is a parent route, so the sidebar, top bar and live connection stay mounted while the
// user moves between pages (only the page content changes) instead of loading again every time.
function AppLayout() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
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

            {/* Developer Management */}
            <Route path="/developer-management" element={<Navigate to="/developer-management/process-screen" replace />} />
            <Route path="/developer-management/process" element={<Navigate to="/developer-management/process-screen" replace />} />
            <Route path="/developer-management/screen" element={<Navigate to="/developer-management/process-screen" replace />} />
            <Route path="/developer-management/process-screen" element={<MenuManagement />} />
            <Route path="/workflows/:workflowSlug/:stageSlug" element={<StageWorkspace />} />
            {/* Old id-based links redirect to the readable address */}
            <Route path="/workflows/:workflowId/stages/:stageId" element={<LegacyStageRedirect />} />
            <Route path="/workflow-management" element={<WorkflowManagement />} />
          </Route>

          {/* Old flat URLs still work */}
          <Route path="/menu-management" element={<Navigate to="/developer-management/process-screen" replace />} />
          <Route path="/user-management" element={<Navigate to="/access-control/user-management" replace />} />
          <Route path="/role-management" element={<Navigate to="/access-control/role-management" replace />} />
          <Route path="/menu-access" element={<Navigate to="/access-control/menu-access" replace />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </ThemeProvider>
  );
}
