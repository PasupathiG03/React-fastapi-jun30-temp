
import { useEffect, useState } from "react";
import { Users, Plus, Trash2, ToggleLeft, ToggleRight, X, Edit2, ShieldAlert } from "lucide-react";
import { UserItem, fetchUsers, createUser, updateUser, deleteUser, UserCreatePayload } from "@/services/user";
import { RoleItem, fetchRoles } from "@/services/role";
import { createPortal } from "react-dom";
import { TablePagination, TableSearchInput, TableExportButton } from "@/components/DataTableControls";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { CustomSelect } from "@/components/CustomSelect";
import { useTableData } from "@/hooks/useTableData";
import { exportToCsv } from "@/lib/exportData";
import { useReportPageLoading } from "@/context/PageLoadingContext";

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  useReportPageLoading("user-management", loadingUsers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<UserItem | null>(null);

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
      const [usersData, rolesData] = await Promise.all([
        fetchUsers(),
        fetchRoles().catch(() => [] as RoleItem[]),
      ]);
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

  function handleDelete(user: UserItem) {
    setItemToDelete(user);
  }

  async function handleDeleteConfirm() {
    if (!itemToDelete) return;
    try {
      await deleteUser(itemToDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== itemToDelete.id));
      setSuccess("User deleted successfully");
      setItemToDelete(null);
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to delete user");
    }
  }

  const table = useTableData(users, (u) =>
    [u.employee_id, u.employee_name, u.location, u.role?.name, u.is_active ? "active" : "inactive"].filter(Boolean).join(" ")
  );

  function handleExport() {
    exportToCsv("users", [
      { header: "Employee ID", value: (u) => u.employee_id },
      { header: "Name", value: (u) => u.employee_name },
      { header: "Location", value: (u) => u.location },
      { header: "Role", value: (u) => u.role?.name },
      { header: "Status", value: (u) => (u.is_active ? "Active" : "Inactive") },
      { header: "Created At", value: (u) => u.created_at },
    ], table.filtered);
  }

  return (
    <PageContainer>
      {/* Header */}
      {loadingUsers ? (
        <div className="flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-slate-200 dark:bg-white/10 shrink-0" />
            <div className="space-y-2">
              <div className="h-5 w-48 bg-slate-200 dark:bg-white/10 rounded" />
              <div className="h-3.5 w-64 bg-slate-100 dark:bg-white/5 rounded" />
            </div>
          </div>
          <div className="w-32 h-10 bg-slate-200 dark:bg-white/10 rounded-xl shrink-0" />
        </div>
      ) : (
        <PageHeader
          icon={Users}
          title="User Management"
          subtitle="Manage employee access and roles"
          actions={
            <button
              onClick={() => handleOpenModal()}
              className="group relative flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          }
        />
      )}

      {/* Create/Edit Form Modal */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="glass-modal rounded-2xl w-full max-w-2xl overflow-visible">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between rounded-t-2xl bg-white/30 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                {editId ? <Edit2 className="w-4 h-4 text-sky-500" /> : <Plus className="w-4 h-4 text-sky-500" />}
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {editId ? "Edit User" : "Add New User"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col">
              <div className="p-6 space-y-5 overflow-visible">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Employee ID */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                      Employee ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      disabled={!!editId}
                      placeholder="e.g. MAH001 or email"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 glass-field text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Employee Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                      Employee Name
                    </label>
                    <input
                      type="text"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 glass-field text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
                    />
                  </div>

                  {/* Location */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                      Location
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. New York Office"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 glass-field text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
                    />
                  </div>

                  {/* Role Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                      Role
                    </label>
                    <CustomSelect<number | "">
                      value={roleId}
                      onChange={(val) => setRoleId(val)}
                      options={[
                        { value: "", label: "-- No Role Assigned --" },
                        ...roles.map((r) => ({ value: r.id, label: r.name })),
                      ]}
                      className="w-full"
                      size="md"
                    />
                  </div>
                </div>

                {/* Feedback */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                {!editId && !error && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-sky-500/[0.08] dark:bg-sky-500/10 border border-sky-500/20 dark:border-sky-400/20 text-xs text-slate-600 dark:text-slate-300">
                    <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00c6ff] to-[#0072ff] flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(0,132,255,0.35)]">
                      <ShieldAlert className="w-4 h-4 text-white" />
                    </span>
                    <span>
                      New users will have the default password:{" "}
                      <b className="font-mono font-bold text-sky-700 dark:text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded-md">Admin@123#</b>
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="px-6 py-4 bg-white/30 dark:bg-white/[0.03] border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end shrink-0 rounded-b-2xl">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 transition-all disabled:opacity-60 shadow-sm"
                >
                  {editId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
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
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-400 shadow-sm">
          ✓ {success}
        </div>
      )}

      {/* Error Message Banner */}
      {error && !isModalOpen && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400 shadow-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Users List */}
      <div className="glass-card rounded-[22px] overflow-hidden">
        {loadingUsers ? (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between animate-pulse">
            <div className="h-4 w-32 bg-slate-200 dark:bg-white/10 rounded" />
            <div className="h-3 w-12 bg-slate-100 dark:bg-white/5 rounded" />
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex flex-wrap sm:flex-nowrap sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Users</h2>
              <span className="text-xs text-slate-400">{users.length} user{users.length !== 1 ? "s" : ""}</span>
            </div>
            {/* Export sits top-right next to the title on mobile; search drops to its own full-width row
                below it. From `sm` up, both sit together to the right of the title in one row instead. */}
            <TableExportButton onExport={handleExport} disabled={table.filtered.length === 0} className="ml-auto sm:ml-0 sm:order-3" />
            <TableSearchInput
              query={table.query}
              onQueryChange={table.setQuery}
              placeholder="Search users..."
              className="basis-full sm:basis-auto sm:w-52 sm:ml-auto sm:order-2"
            />
          </div>
        )}

        {loadingUsers ? (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04] animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="w-8 shrink-0 flex justify-center">
                  <div className="w-3 h-4 bg-slate-200 dark:bg-white/10 rounded" />
                </div>
                <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3.5 w-32 bg-slate-200 dark:bg-white/10 rounded" />
                  <div className="h-3 w-48 bg-slate-100 dark:bg-white/5 rounded" />
                </div>
                <div className="h-6 w-16 bg-slate-100 dark:bg-white/5 rounded-full shrink-0" />
                <div className="h-6 w-16 bg-slate-100 dark:bg-white/5 rounded-full shrink-0" />
                <div className="w-5 h-5 bg-slate-100 dark:bg-white/5 rounded-full shrink-0" />
                <div className="w-4 h-4 bg-slate-100 dark:bg-white/5 rounded shrink-0" />
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
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.04] m-0 p-0">
              {table.paged.map((user, index) => (
                <li key={user.id} className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 px-6 py-3.5 hover:bg-white/35 dark:hover:bg-white/[0.02] transition-colors bg-white dark:bg-transparent">

                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* S.No */}
                    <div className="w-8 shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500 text-center">
                      {(table.page - 1) * table.pageSize + index + 1}
                    </div>

                    {/* Icon */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: user.is_active
                          ? "rgba(14, 165, 233, 0.15)"
                          : "rgba(148, 163, 184, 0.1)",
                      }}
                    >
                      <Users className={`w-4 h-4 ${user.is_active ? "text-sky-500" : "text-slate-400"}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {user.employee_name || user.employee_id}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {user.employee_id}
                        {user.location && ` • ${user.location}`}
                        {user.role && ` • ${user.role.name}`}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${user.is_active
                          ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                          : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                        }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center shrink-0 self-end sm:self-auto pl-11 sm:pl-0">
                    <button
                      onClick={() => handleOpenModal(user)}
                      className="text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors shrink-0 mx-1.5"
                      title="Edit user"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleToggleStatus(user)}
                      className="text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors shrink-0"
                      title={user.is_active ? "Deactivate" : "Activate"}
                    >
                      {user.is_active ? (
                        <ToggleRight className="w-5 h-5 text-sky-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>

                    <button
                      onClick={() => handleDelete(user)}
                      className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors shrink-0 ml-1.5"
                      title="Delete user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {table.filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">No results match your search</div>
            )}
            <TablePagination
              page={table.page}
              pageSize={table.pageSize}
              totalPages={table.totalPages}
              totalItems={table.filtered.length}
              onPageChange={table.setPage}
              onPageSizeChange={table.setPageSize}
            />
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {itemToDelete && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setItemToDelete(null)}
          />
          <div className="relative glass-modal rounded-2xl p-6 max-w-sm w-full z-10 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Delete User?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Are you sure you want to permanently delete <span className="font-semibold text-slate-800 dark:text-slate-200">{itemToDelete.employee_name || itemToDelete.employee_id}</span>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </PageContainer>
  );
}
