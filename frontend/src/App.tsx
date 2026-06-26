import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UserManagement from "./pages/UserManagement";
import RoleManagement from "./pages/RoleManagement";
import MenuManagement from "./pages/MenuManagement";
import TemplateUpload from "./pages/TemplateUpload";
import DocsUpload from "./pages/DocsUpload";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
        <Route path="/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
        <Route path="/user-management" element={<DashboardLayout><UserManagement /></DashboardLayout>} />
        <Route path="/role-management" element={<DashboardLayout><RoleManagement /></DashboardLayout>} />
        <Route path="/menu-management" element={<DashboardLayout><MenuManagement /></DashboardLayout>} />
        <Route path="/template-upload" element={<DashboardLayout><TemplateUpload /></DashboardLayout>} />
        <Route path="/docs-upload" element={<DashboardLayout><DocsUpload /></DashboardLayout>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
