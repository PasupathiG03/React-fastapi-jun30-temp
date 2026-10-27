import { useEffect, useState } from "react";
import { showError, showSuccess, showDelete, showUpdate } from "../lib/toast";
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight, Edit2, Search } from "lucide-react";
import { RoleItem, fetchRoles, createRole, updateRole, deleteRole, RoleCreatePayload } from "@/services/role";
import { TablePagination, TableSearchInput, TableExportButton } from "@/components/DataTableControls";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { useTableData } from "@/hooks/useTableData";
import Modal, { ConfirmDialog, ModalBody, ModalCancelButton, ModalFooter } from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import { PRIMARY_BUTTON, RowActionButton } from "@/components/ui";

export default function RoleManagementPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<RoleItem | null>(null);

  // Form state
  const [name, setName] = useState("");

  const [submitting, setSubmitting] = useState(false);

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
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) return showError("Role Name is required");

    setSubmitting(true);
    try {
      const payload: RoleCreatePayload = {
        name: name.trim(),
      };

      if (editId) {
        const updated = await updateRole(editId, payload);
        setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        showUpdate(`Role "${updated.name}" updated successfully`);
      } else {
        const created = await createRole(payload);
        setRoles((prev) => [created, ...prev]);
        showSuccess(`Role "${created.name}" created successfully`);
      }
      setIsModalOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(role: RoleItem) {
    try {
      const updated = await updateRole(role.id, { is_active: !role.is_active });
      if (!updated.is_active) {
        setRoles((prev) => prev.filter((r) => r.id !== updated.id));
        showDelete("Role deactivated and removed from view");
      } else {
        setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
    } catch {
      showError("Failed to update role status");
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
      showDelete(`Role "${itemToDelete.name}" deleted`);
      setItemToDelete(null);
    } catch {
      showError("Failed to delete role");
    }
  }

  const table = useTableData(roles, (r) =>
    [r.name, r.description, r.is_active ? "active" : "inactive"].filter(Boolean).join(" ")
  );

  function handleExport() {
    void import("@/lib/exportData").then(({ exportToCsv }) => exportToCsv("roles", [
      { header: "Role", value: (r) => r.name },
      { header: "Description", value: (r) => r.description },
      { header: "Status", value: (r) => (r.is_active ? "Active" : "Inactive") },
      { header: "Created At", value: (r) => r.created_at },
    ], table.filtered));
  }

  return (
    <PageContainer>
      <PageHeader
        icon={Shield}
        title="Role Management"
        subtitle="Create and configure system roles"
        loading={loadingRoles}
        actions={
          <button onClick={() => handleOpenModal()} className={PRIMARY_BUTTON}>
            <Plus className="w-4 h-4" />
            Add Role
          </button>
        }
      />

      {isModalOpen && (
        <Modal
          title={editId ? "Edit Role" : "Add New Role"}
          subtitle={editId ? "Rename this role" : "Roles decide which screens a user can open"}
          icon={editId ? Edit2 : Plus}
          onClose={() => setIsModalOpen(false)}
        >
          <form onSubmit={handleSubmit}>
            <ModalBody>
              <div className="space-y-1.5">
                <label htmlFor="role-name" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Role Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="role-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Content Editor"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-slate-200 glass-field placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-colors"
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalCancelButton onClick={() => setIsModalOpen(false)} />
              <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
                {editId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {submitting ? "Saving..." : editId ? "Save Changes" : "Add Role"}
              </button>
            </ModalFooter>
          </form>
        </Modal>
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
          <EmptyState
            icon={Shield}
            title="No roles yet"
            description="Create a role, then grant it screens in Menu Access."
            action={
              <button onClick={() => handleOpenModal()} className={PRIMARY_BUTTON}>
                <Plus className="w-4 h-4" />
                Add Role
              </button>
            }
          />
        ) : (
          <div className="flex flex-col">
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.04] m-0 p-0">
              {table.paged.map((role, index) => (
                <li key={role.id} className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 px-6 py-3.5 hover:bg-white/35 dark:hover:bg-white/[0.03] transition-colors">

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
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto pl-11 sm:pl-0">
                    <RowActionButton label={`Edit ${role.name}`} onClick={() => handleOpenModal(role)}>
                      <Edit2 className="w-4 h-4" />
                    </RowActionButton>
                    <RowActionButton
                      label={`${role.is_active ? "Deactivate" : "Activate"} ${role.name}`}
                      onClick={() => handleToggleStatus(role)}
                    >
                      {role.is_active ? <ToggleRight className="w-5 h-5 text-sky-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </RowActionButton>
                    <RowActionButton label={`Delete ${role.name}`} tone="danger" onClick={() => handleDelete(role)}>
                      <Trash2 className="w-4 h-4" />
                    </RowActionButton>
                  </div>
                </li>
              ))}
            </ul>

            {table.filtered.length === 0 && (
              <EmptyState compact icon={Search} title="No matching roles" description="Try a different name or clear the search." />
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

      {itemToDelete && (
        <ConfirmDialog
          title="Delete role?"
          message={
            <>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{itemToDelete.name}</span> will be removed
              permanently. Users with this role lose its screens. This can't be undone.
            </>
          }
          onConfirm={handleDeleteConfirm}
          onCancel={() => setItemToDelete(null)}
        />
      )}
    </PageContainer>
  );
}
