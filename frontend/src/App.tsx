import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout";

// Every page is loaded on demand, so its code is only downloaded when the route is opened.
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));
const MenuAccess = lazy(() => import("./pages/MenuAccess"));
const MenuManagement = lazy(() => import("./pages/MenuManagement"));
const WorkflowManagement = lazy(() => import("./pages/WorkflowManagement"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/dashboard" element={<Page><Dashboard /></Page>} />

          {/* Access Control */}
          <Route path="/access-control" element={<Navigate to="/access-control/user-management" replace />} />
          <Route path="/access-control/user-management" element={<Page><UserManagement /></Page>} />
          <Route path="/access-control/role-management" element={<Page><RoleManagement /></Page>} />
          <Route path="/access-control/menu-access" element={<Page><MenuAccess /></Page>} />

          <Route path="/menu-management" element={<Page><MenuManagement /></Page>} />
          <Route path="/workflow-management" element={<Page><WorkflowManagement /></Page>} />

          {/* Old flat URLs still work */}
          <Route path="/user-management" element={<Navigate to="/access-control/user-management" replace />} />
          <Route path="/role-management" element={<Navigate to="/access-control/role-management" replace />} />
          <Route path="/menu-access" element={<Navigate to="/access-control/menu-access" replace />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
