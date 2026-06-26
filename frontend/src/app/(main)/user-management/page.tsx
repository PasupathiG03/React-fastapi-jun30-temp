"use client";

import { useEffect, useState } from "react";
import { Users, Plus, Trash2, ToggleLeft, ToggleRight, X, Edit2, ShieldAlert } from "lucide-react";
import { UserItem, fetchUsers, createUser, updateUser, deleteUser, UserCreatePayload } from "@/services/user";
import { RoleItem, fetchRoles } from "@/services/role";
import { createPortal } from "react-dom";

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [editId, setEditId] = useState<number | null>(null);

  // Form state
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [location, setLocation] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      await new Promise(r => setTimeout(r, 600)); // Show skeleton loader
      const [usersData, rolesData] = await Promise.all([
        fetchUsers(),
        fetchRoles().catch(() => [] as RoleItem[])
      ]);
      setUsers(usersData);
      setUsers(usersData);
      setRoles(rolesData.filter(r => r.is_active)); // Only active roles for assignment
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }

  function handleOpenModal(user?: UserItem) {
    if (user) {
      setEditId(user.id);
      setEmployeeId(user.employee_id);
      setEmployeeName(user.employee_name || "");
      setLocation(user.location || "");
      setRoleId(user.role_id || "");
    } else {
      setEditId(null);
      setEmployeeId("");
      setEmployeeName("");
      setLocation("");
      setRoleId("");
    }
    setError("");
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!employeeId.trim()) return setError("Employee ID is required");

    setSubmitting(true);
    try {
      const payload: UserCreatePayload = {
        employee_id: employeeId.trim(),
        employee_name: employeeName.trim() || null,
        location: location.trim() || null,
        role_id: roleId ? Number(roleId) : null,
      };

      if (editId) {
        const updated = await updateUser(editId, payload);
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        setSuccess(`"${updated.employee_name || updated.employee_id}" updated successfully`);
      } else {
        const created = await createUser(payload);
        setUsers((prev) => [created, ...prev]);
        setSuccess(`"${created.employee_name || created.employee_id}" added with default password Admin@123#`);
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(user: UserItem) {
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active });
      if (!updated.is_active) {
        setUsers((prev) => prev.filter((u) => u.id !== updated.id));
        setSuccess("User deactivated and removed from view");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      }
    } catch {
      setError("Failed to update user status");
    }
  }

  async function handleDelete(user: UserItem) {
    if (!confirm(`Are you sure you want to delete ${user.employee_name || user.employee_id}?`)) return;
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setSuccess("User deleted successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to delete user");
    }
  }

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);
  const paginatedUsers = users.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="p-6 w-full space-y-6">
      {/* Header */}
      {loadingUsers ? (
        <div className="flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-200 shrink-0" />
            <div className="space-y-2">
              <div className="h-5 w-48 bg-gray-200 rounded" />
              <div className="h-3.5 w-64 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="w-36 h-9 bg-gray-200 rounded-lg shrink-0" />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
            >
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">User Management</h1>
              <p className="text-sm text-gray-500">Manage employee access and roles</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="group relative flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:shadow-md hover:opacity-90 transition-all shadow-sm"
            style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
          >
            <Plus className="w-4 h-4" />
            Add User
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2.5 py-1 bg-gray-900 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              Create a new user
            </span>
          </button>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-2xl overflow-visible">
            <div
              className="px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(29,85,232,0.06), rgba(18,53,176,0.04))",
              }}
            >
              <div className="flex items-center gap-2">
                {editId ? <Edit2 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
                <h2 className="text-sm font-semibold text-gray-800">
                  {editId ? "Edit User" : "Add New User"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col">
              <div className="p-6 space-y-5 overflow-visible">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Employee ID */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Employee ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      disabled={!!editId}
                      placeholder="e.g. MAH001 or email"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Employee Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Employee Name
                    </label>
                    <input
                      type="text"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {/* Location */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Location
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. New York Office"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {/* Role Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Role
                    </label>
                    <select
                      value={roleId}
                      onChange={(e) => setRoleId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                    >
                      <option value="">-- No Role Assigned --</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Feedback */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
                    {error}
                  </div>
                )}
                
                {!editId && !error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700">
                    <ShieldAlert className="w-4 h-4" />
                    New users will have the default password: <b>Admin@123#</b>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end shrink-0 rounded-b-2xl">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 shadow-sm hover:shadow-md hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
                >
                  {editId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-5 h-5" />}
                  {submitting ? "Saving..." : editId ? "Save Changes" : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Success Message Banner */}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-100 text-sm text-green-700 shadow-sm">
          ✓ {success}
        </div>
      )}

      {/* Error Message Banner (for data loading issues) */}
      {error && !isModalOpen && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600 shadow-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Users List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loadingUsers ? (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-12 bg-gray-100 rounded" />
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Existing Users</h2>
            <span className="text-xs text-gray-400">{users.length} user{users.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {loadingUsers ? (
          <div className="divide-y divide-gray-50 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="w-8 shrink-0 flex justify-center">
                  <div className="w-3 h-4 bg-gray-100 rounded" />
                </div>
                <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3.5 w-32 bg-gray-200 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-16 bg-blue-50 rounded-full shrink-0" />
                <div className="h-6 w-16 bg-green-50 rounded-full shrink-0" />
                <div className="w-5 h-5 bg-gray-100 rounded-full shrink-0" />
                <div className="w-4 h-4 bg-gray-100 rounded shrink-0" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Users className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No users found</p>
            <p className="text-xs mt-0.5">Add your first user above</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <ul className="divide-y divide-gray-50 m-0 p-0">
              {paginatedUsers.map((user, index) => (
                <li key={user.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors bg-white">
                  
                  {/* S.No */}
                  <div className="w-8 shrink-0 text-sm font-medium text-gray-400 text-center">
                    {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                  </div>

                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: user.is_active
                        ? "linear-gradient(135deg, rgba(29,85,232,0.12), rgba(18,53,176,0.08))"
                        : "rgba(0,0,0,0.04)",
                    }}
                  >
                    <Users className={`w-4 h-4 ${user.is_active ? "text-blue-600" : "text-gray-400"}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {user.employee_name || user.employee_id}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {user.employee_id}
                      {user.location && ` • ${user.location}`}
                      {user.role && ` • ${user.role.name}`}
                    </p>
                    {user.created_at && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Added by {user.creator?.employee_name || user.creator?.employee_id || "System"} on {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                      user.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {user.is_active ? "Active" : "Hidden"}
                  </span>

                  {/* Actions */}
                  <button
                    onClick={() => handleOpenModal(user)}
                    className="relative group text-gray-400 hover:text-blue-600 transition-colors shrink-0 mx-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Edit user
                    </span>
                  </button>

                  <button
                    onClick={() => handleToggleStatus(user)}
                    className="relative group text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                  >
                    {user.is_active ? (
                      <ToggleRight className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      {user.is_active ? "Deactivate" : "Activate"}
                    </span>
                  </button>

                  <button
                    onClick={() => handleDelete(user)}
                    className="relative group text-gray-300 hover:text-red-500 transition-colors shrink-0 ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Delete user
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <span className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, users.length)} of {users.length} entries
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-gray-600 transition-colors shadow-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-gray-600 transition-colors shadow-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
