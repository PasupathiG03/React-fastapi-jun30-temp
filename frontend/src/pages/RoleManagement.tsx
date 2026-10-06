import { useEffect, useState } from "react";
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight, X, Edit2 } from "lucide-react";
import { RoleItem, fetchRoles, createRole, updateRole, deleteRole, RoleCreatePayload } from "@/services/role";
import { createPortal } from "react-dom";
import { TablePagination, TableSearchInput, TableExportButton } from "@/components/DataTableControls";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { useTableData } from "@/hooks/useTableData";
import { exportToCsv } from "@/lib/exportData";
import { useReportPageLoading } from "@/context/PageLoadingContext";

export default function RoleManagementPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  useReportPageLoading("role-management", loadingRoles);
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
    <PageContainer>
      {/* Header */}
      {loadingRoles ? (
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
          icon={Shield}
          title="Role Management"
          subtitle="Create and configure system roles"
          actions={
            <button
              onClick={() => handleOpenModal()}
              className="group relative flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Role
            </button>
          }
        />
      )}

      {/* Create/Edit Form Modal */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="glass-modal rounded-2xl w-full max-w-lg overflow-visible">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between rounded-t-2xl bg-white/30 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                {editId ? <Edit2 className="w-4 h-4 text-sky-500" /> : <Plus className="w-4 h-4 text-sky-500" />}
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {editId ? "Edit Role" : "Add New Role"}
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
                {/* Role Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                    Role Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Content Editor"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 glass-field placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                  />
                </div>

                {/* Feedback */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="px-6 py-4 bg-white/30 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end shrink-0 rounded-b-2xl">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 transition-all disabled:opacity-60 shadow-sm"
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
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-400 shadow-sm">
          ✓ {success}
        </div>
      )}

      {/* Roles List */}
      <div className="glass-card rounded-[22px] overflow-hidden">
        {loadingRoles ? (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between animate-pulse">
            <div className="h-4 w-32 bg-slate-200 dark:bg-white/10 rounded" />
            <div className="h-3 w-12 bg-slate-100 dark:bg-white/5 rounded" />
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex flex-wrap sm:flex-nowrap sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Roles</h2>
              <span className="text-xs text-slate-400">{roles.length} role{roles.length !== 1 ? "s" : ""}</span>
            </div>
            {/* Export sits top-right next to the title on mobile; search drops to its own full-width row
                below it. From `sm` up, both sit together to the right of the title in one row instead. */}
            <TableExportButton onExport={handleExport} disabled={table.filtered.length === 0} className="ml-auto sm:ml-0 sm:order-3" />
            <TableSearchInput
              query={table.query}
              onQueryChange={table.setQuery}
              placeholder="Search roles..."
              className="basis-full sm:basis-auto sm:w-52 sm:ml-auto sm:order-2"
            />
          </div>
        )}

        {loadingRoles ? (
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
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-5 h-5 bg-slate-100 dark:bg-white/5 rounded shrink-0" />
                  <div className="w-5 h-5 bg-slate-100 dark:bg-white/5 rounded shrink-0" />
                </div>
              </div>
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
            <Shield className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No roles found</p>
            <p className="text-xs mt-0.5">Add your first role above</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.04] m-0 p-0">
              {table.paged.map((role, index) => (
                <li key={role.id} className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 px-6 py-3.5 hover:bg-white/35 dark:hover:bg-white/[0.02] transition-colors bg-white dark:bg-transparent">

                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* S.No */}
                    <div className="w-8 shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500 text-center">
                      {(table.page - 1) * table.pageSize + index + 1}
                    </div>

                    {/* Icon */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: role.is_active
                          ? "rgba(14, 165, 233, 0.15)"
                          : "rgba(148, 163, 184, 0.1)",
                      }}
                    >
                      <Shield className={`w-4 h-4 ${role.is_active ? "text-sky-500" : "text-slate-400"}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${role.is_active ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}`}>
                        {role.name}
                      </p>
                      {role.created_at && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          Added by {role.creator?.employee_name || role.creator?.employee_id || "System"} on {new Date(role.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {/* Status badge */}
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${role.is_active
                          ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                          : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                        }`}
                    >
                      {role.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center shrink-0 self-end sm:self-auto pl-11 sm:pl-0">
                    <button
                      onClick={() => handleOpenModal(role)}
                      className="text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors shrink-0 mx-1.5"
                      title="Edit role"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleToggleStatus(role)}
                      className="text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors shrink-0"
                      title={role.is_active ? "Deactivate" : "Activate"}
                    >
                      {role.is_active ? (
                        <ToggleRight className="w-5 h-5 text-sky-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>

                    <button
                      onClick={() => handleDelete(role)}
                      className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors shrink-0 ml-1.5"
                      title="Delete role"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {table.filtered.length === 0 && (
              <div className="py-10 text-center text-xs text-slate-400">No results match your search</div>
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
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Delete Role?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Are you sure you want to permanently delete <span className="font-semibold text-slate-800 dark:text-slate-200">{itemToDelete.name}</span>? This action cannot be undone.
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
