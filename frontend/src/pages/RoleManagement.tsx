
import { useEffect, useState } from "react";
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight, X, Edit2 } from "lucide-react";
import { RoleItem, fetchRoles, createRole, updateRole, deleteRole, RoleCreatePayload } from "@/services/role";
import { createPortal } from "react-dom";
import { TablePagination, TableToolbar } from "@/components/DataTableControls";
import { useTableData } from "@/hooks/useTableData";
import { exportToCsv } from "@/lib/exportData";

export default function RoleManagementPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<RoleItem | null>(null);

  // Form state
  const [name, setName] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadRoles();
  }, []);

  async function loadRoles() {
    try {
      const data = await fetchRoles();
      setRoles(data);
    } catch {
      // silently fail — non-superusers get 403
    } finally {
      setLoadingRoles(false);
    }
  }

  function handleOpenModal(role?: RoleItem) {
    if (role) {
      setEditId(role.id);
      setName(role.name);
    } else {
      setEditId(null);
      setName("");
    }
    setError("");
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) return setError("Role Name is required");

    setSubmitting(true);
    try {
      const payload: RoleCreatePayload = {
        name: name.trim(),
      };

      if (editId) {
        const updated = await updateRole(editId, payload);
        setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setSuccess(`Role "${updated.name}" updated successfully`);
      } else {
        const created = await createRole(payload);
        setRoles((prev) => [created, ...prev]);
        setSuccess(`Role "${created.name}" created successfully`);
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(role: RoleItem) {
    try {
      const updated = await updateRole(role.id, { is_active: !role.is_active });
      if (!updated.is_active) {
        setRoles((prev) => prev.filter((r) => r.id !== updated.id));
        setSuccess("Role deactivated and removed from view");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
    } catch {
      setError("Failed to update role status");
    }
  }

  function handleDelete(role: RoleItem) {
    setItemToDelete(role);
  }

  async function handleDeleteConfirm() {
    if (!itemToDelete) return;
    try {
      await deleteRole(itemToDelete.id);
      setRoles((prev) => prev.filter((r) => r.id !== itemToDelete.id));
      setSuccess("Role deleted successfully");
      setItemToDelete(null);
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to delete role");
    }
  }

  const table = useTableData(roles, (r) =>
    [r.name, r.description, r.is_active ? "active" : "inactive"].filter(Boolean).join(" ")
  );

  function handleExport() {
    exportToCsv("roles", [
      { header: "Role", value: (r) => r.name },
      { header: "Description", value: (r) => r.description },
      { header: "Status", value: (r) => (r.is_active ? "Active" : "Inactive") },
      { header: "Created At", value: (r) => r.created_at },
    ], table.filtered);
  }

  return (
    <div className="p-6 w-full space-y-6">
      {/* Header */}
      {loadingRoles ? (
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
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Role Management</h1>
              <p className="text-sm text-gray-500">Create and configure system roles</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="group relative flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:shadow-md hover:opacity-90 transition-all shadow-sm"
            style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
          >
            <Plus className="w-4 h-4" />
            Add Role
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2.5 py-1 bg-gray-900 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              Create a new role
            </span>
          </button>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-lg overflow-visible">
            <div
              className="px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(29,85,232,0.06), rgba(18,53,176,0.04))",
              }}
            >
              <div className="flex items-center gap-2">
                {editId ? <Edit2 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
                <h2 className="text-sm font-semibold text-gray-800">
                  {editId ? "Edit Role" : "Add New Role"}
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
                {/* Role Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Role Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Content Editor"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>

                {/* Feedback */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
                    {error}
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
                  {submitting ? "Saving..." : editId ? "Save Changes" : "Add Role"}
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

      {/* Roles List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loadingRoles ? (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-12 bg-gray-100 rounded" />
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Roles</h2>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">{roles.length} role{roles.length !== 1 ? "s" : ""}</span>
              <TableToolbar
                query={table.query}
                onQueryChange={table.setQuery}
                onExport={handleExport}
                exportDisabled={table.filtered.length === 0}
                placeholder="Search roles..."
              />
            </div>
          </div>
        )}

        {loadingRoles ? (
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
                <div className="h-6 w-16 bg-green-50 rounded-full shrink-0" />
                <div className="w-5 h-5 bg-gray-100 rounded-full shrink-0" />
                <div className="w-4 h-4 bg-gray-100 rounded shrink-0" />
              </div>
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Shield className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No roles found</p>
            <p className="text-xs mt-0.5">Add your first role above</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <ul className="divide-y divide-gray-50 m-0 p-0">
              {table.paged.map((role, index) => (
                <li key={role.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors bg-white">
                  
                  {/* S.No */}
                  <div className="w-8 shrink-0 text-sm font-medium text-gray-400 text-center">
                    {(table.page - 1) * table.pageSize + index + 1}
                  </div>

                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: role.is_active
                        ? "linear-gradient(135deg, rgba(29,85,232,0.12), rgba(18,53,176,0.08))"
                        : "rgba(0,0,0,0.04)",
                    }}
                  >
                    <Shield className={`w-4 h-4 ${role.is_active ? "text-blue-600" : "text-gray-400"}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${role.is_active ? "text-gray-800" : "text-gray-400"}`}>
                      {role.name}
                    </p>
                    {role.created_at && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Added by {role.creator?.employee_name || role.creator?.employee_id || "System"} on {new Date(role.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                      role.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {role.is_active ? "Active" : "Inactive"}
                  </span>

                  {/* Actions */}
                  <button
                    onClick={() => handleOpenModal(role)}
                    className="relative group text-gray-400 hover:text-blue-600 transition-colors shrink-0 mx-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Edit role
                    </span>
                  </button>

                  <button
                    onClick={() => handleToggleStatus(role)}
                    className="relative group text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                  >
                    {role.is_active ? (
                      <ToggleRight className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      {role.is_active ? "Deactivate" : "Activate"}
                    </span>
                  </button>

                  <button
                    onClick={() => handleDelete(role)}
                    className="relative group text-gray-300 hover:text-red-500 transition-colors shrink-0 ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Delete role
                    </span>
                  </button>
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
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setItemToDelete(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Role?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to permanently delete <span className="font-semibold text-gray-800">{itemToDelete.name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setItemToDelete(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
