
import { useEffect, useRef, useState } from "react";
import { showError, showSuccess, showDelete, showUpdate } from "../lib/toast";
import {
  Users,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Edit2,
  Search,
  ShieldAlert,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  UserItem,
  fetchUsers,
  fetchDefaultPassword,
  createUser,
  updateUser,
  deleteUser,
  UserCreatePayload,
  bulkImportUsers,
  BulkUserInput,
  BulkImportResult,
} from "@/services/user";
import { RoleItem, fetchRoles } from "@/services/role";
import { TablePagination, TableSearchInput, TableExportButton } from "@/components/DataTableControls";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { CustomSelect } from "@/components/CustomSelect";
import { useTableData } from "@/hooks/useTableData";
import Modal, { ConfirmDialog, ModalBody, ModalCancelButton, ModalFooter } from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import { PRIMARY_BUTTON, RowActionButton, SECONDARY_BUTTON } from "@/components/ui";

/** "Ravi Kumar" -> "RK", "MAH001" -> "MA" for the row avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

const BULK_IMPORT_COLUMNS: Record<string, string[]> = {
  employee_id: ["employee_id", "employee id", "id", "emp id", "empid"],
  employee_name: ["employee_name", "employee name", "name"],
  location: ["location"],
  role_name: ["role_name", "role name", "role"],
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  // Comes from the server's .env (GET /api/users/default-password), so it is never in the frontend bundle.
  const [defaultPassword, setDefaultPassword] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<UserItem | null>(null);

  // Form state
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [location, setLocation] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");

  const [submitting, setSubmitting] = useState(false);

  // Bulk import
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkUserInput[]>([]);
  const [bulkParseError, setBulkParseError] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const [bulkDragOver, setBulkDragOver] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const [usersData, rolesData, defaultPw] = await Promise.all([
        fetchUsers(),
        fetchRoles().catch(() => [] as RoleItem[]),
        fetchDefaultPassword().catch(() => ""),
      ]);
      setDefaultPassword(defaultPw);
      setUsers(usersData);
      setRoles(rolesData.filter(r => r.is_active)); // Only active roles for assignment
    } catch (err: any) {
      showError(err.message || "Failed to load users");
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
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!employeeId.trim()) return showError("Employee ID is required");

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
        showUpdate(`"${updated.employee_name || updated.employee_id}" updated successfully`);
      } else {
        const created = await createUser(payload);
        setUsers((prev) => [created, ...prev]);
        showSuccess(`"${created.employee_name || created.employee_id}" added with the default password${defaultPassword ? ` ${defaultPassword}` : ""}`);
      }
      setIsModalOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(user: UserItem) {
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch {
      showError("Failed to update user status");
    }
  }

  function handleDelete(user: UserItem) {
    setItemToDelete(user);
  }

  async function handleDeleteConfirm() {
    if (!itemToDelete) return;
    try {
      await deleteUser(itemToDelete.id);
      // The API soft-deletes (is_active -> false); the row stays visible, just flagged Inactive.
      const deletedId = itemToDelete.id;
      setUsers((prev) => prev.map((u) => (u.id === deletedId ? { ...u, is_active: false } : u)));
      showDelete("User deactivated");
      setItemToDelete(null);
    } catch {
      showError("Failed to deactivate user");
    }
  }

  const table = useTableData(users, (u) =>
    [u.employee_id, u.employee_name, u.location, u.role?.name, u.is_active ? "active" : "inactive"].filter(Boolean).join(" ")
  );

  function handleExport() {
    void import("@/lib/exportData").then(({ exportToCsv }) => exportToCsv("users", [
      { header: "Employee ID", value: (u) => u.employee_id },
      { header: "Name", value: (u) => u.employee_name },
      { header: "Location", value: (u) => u.location },
      { header: "Role", value: (u) => u.role?.name },
      { header: "Status", value: (u) => (u.is_active ? "Active" : "Inactive") },
      { header: "Created At", value: (u) => u.created_at },
    ], table.filtered));
  }

  function handleOpenBulk() {
    setBulkFileName("");
    setBulkRows([]);
    setBulkParseError("");
    setBulkResult(null);
    setIsBulkOpen(true);
  }

  function handleDownloadTemplate() {
    void import("@/lib/exportData").then(({ exportToCsv }) => exportToCsv(
      "user_import_template",
      [
        { header: "Employee ID", value: (r: Record<string, string>) => r.employee_id },
        { header: "Employee Name", value: (r: Record<string, string>) => r.employee_name },
        { header: "Location", value: (r: Record<string, string>) => r.location },
        { header: "Role", value: (r: Record<string, string>) => r.role },
      ],
      [{ employee_id: "MAH1234", employee_name: "Jane Doe", location: "New York Office", role: "Admin" }]
    ));
  }

  async function processBulkFile(file: File) {
    setBulkResult(null);
    setBulkFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setBulkRows([]);
      const msg = "Please upload a .csv file.";
      setBulkParseError(msg);
      showError(msg);
      return;
    }
    try {
      const [text, { parseCsv, mapCsvColumns }] = await Promise.all([file.text(), import("@/lib/importCsv")]);
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setBulkRows([]);
        const msg = "That file has no data rows below the header.";
        setBulkParseError(msg);
        showError(msg);
        return;
      }
      const [header, ...dataRows] = rows;
      const colIndex = mapCsvColumns(header, BULK_IMPORT_COLUMNS);
      if (colIndex.employee_id === undefined) {
        setBulkRows([]);
        const msg = 'Couldn\'t find an "Employee ID" column in that file\'s header row.';
        setBulkParseError(msg);
        showError(msg);
        return;
      }
      const parsed: BulkUserInput[] = dataRows
        .filter((r) => r.some((cell) => cell.trim() !== ""))
        .map((r) => ({
          employee_id: (r[colIndex.employee_id] ?? "").trim(),
          employee_name: colIndex.employee_name !== undefined ? (r[colIndex.employee_name] ?? "").trim() || null : null,
          location: colIndex.location !== undefined ? (r[colIndex.location] ?? "").trim() || null : null,
          role_name: colIndex.role_name !== undefined ? (r[colIndex.role_name] ?? "").trim() || null : null,
        }));
      setBulkParseError("");
      setBulkRows(parsed);
    } catch {
      setBulkRows([]);
      const msg = "Couldn't read that file. Make sure it's a .csv export.";
      setBulkParseError(msg);
      showError(msg);
    }
  }

  function handleBulkFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processBulkFile(file);
  }

  function handleBulkDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setBulkDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processBulkFile(file);
  }

  async function handleBulkSubmit() {
    if (bulkRows.length === 0) return;
    setBulkSubmitting(true);
    setBulkParseError("");
    try {
      const result = await bulkImportUsers(bulkRows);
      if (result.created > 0 || result.reactivated > 0) await loadUsers();
      if (result.failed === 0) {
        // Nothing for the user to review -- close and report it the same way a single Add User does.
        handleCloseBulk();
        const parts = [
          result.created > 0 && `${result.created} created`,
          result.reactivated > 0 && `${result.reactivated} reactivated`,
        ].filter(Boolean);
        showSuccess(`${parts.join(", ")} successfully`);
      } else {
        setBulkResult(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk import failed";
      setBulkParseError(msg);
      showError(msg);
    } finally {
      setBulkSubmitting(false);
    }
  }

  function handleCloseBulk() {
    setIsBulkOpen(false);
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
  }

  return (
    <PageContainer>
      <PageHeader
        icon={Users}
        title="User Management"
        subtitle="Manage employee access and roles"
        loading={loadingUsers}
        actions={
          <div className="flex items-center gap-2.5">
            <button onClick={handleOpenBulk} className={SECONDARY_BUTTON}>
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Bulk Import</span>
              <span className="sm:hidden">Import</span>
            </button>
            <button onClick={() => handleOpenModal()} className={PRIMARY_BUTTON}>
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>
        }
      />

      {/* Create/Edit Form Modal */}
      {isModalOpen && (
        <Modal
          title={editId ? "Edit User" : "Add New User"}
          subtitle={editId ? employeeId : "They sign in with their Employee ID"}
          icon={editId ? Edit2 : Plus}
          size="2xl"
          onClose={() => setIsModalOpen(false)}
        >
            <form onSubmit={handleSubmit} className="flex flex-col">
              <ModalBody>
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

                {!editId && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-sky-500/[0.08] dark:bg-sky-500/10 border border-sky-500/20 dark:border-sky-400/20 text-xs text-slate-600 dark:text-slate-300">
                    <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00c6ff] to-[#0072ff] flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(0,132,255,0.35)]">
                      <ShieldAlert className="w-4 h-4 text-white" />
                    </span>
                    <span>
                      New users will have the default password:{" "}
                      <b className="font-mono font-bold text-sky-700 dark:text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded-md">{defaultPassword || "…"}</b>
                    </span>
                  </div>
                )}
              </ModalBody>

              <ModalFooter>
                <ModalCancelButton onClick={() => setIsModalOpen(false)} />
                <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
                  {editId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {submitting ? "Saving..." : editId ? "Save Changes" : "Add User"}
                </button>
              </ModalFooter>
            </form>
        </Modal>
      )}

      {/* Bulk Import Modal */}
      {isBulkOpen && (
        <Modal
          title="Bulk Import Users"
          subtitle="Add many users at once from a CSV file"
          icon={Upload}
          size="2xl"
          onClose={handleCloseBulk}
        >
            <ModalBody>
              {!bulkResult ? (
                <>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download a template
                    </button>
                  </div>

                  <div
                    onDragOver={(e) => { e.preventDefault(); setBulkDragOver(true); }}
                    onDragLeave={() => setBulkDragOver(false)}
                    onDrop={handleBulkDrop}
                    onClick={() => bulkFileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        bulkFileInputRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label="Choose a CSV file to import"
                    className={`flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${bulkDragOver
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-slate-200 dark:border-white/10 hover:border-sky-400 dark:hover:border-sky-500/50 bg-white/30 dark:bg-white/[0.02]"
                      }`}
                  >
                    <input
                      ref={bulkFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleBulkFileChange}
                      onClick={(e) => e.stopPropagation()}
                      className="hidden"
                    />
                    <FileSpreadsheet className={`w-7 h-7 ${bulkDragOver ? "text-sky-500" : "text-slate-400 dark:text-slate-500"}`} />
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Drag and drop a .csv file here, or click to browse
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Needs an Employee ID column; Name, Location and Role are optional
                    </p>
                    {bulkFileName && !bulkParseError && (
                      <p className="mt-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                        {bulkFileName} &middot; {bulkRows.length} row{bulkRows.length !== 1 ? "s" : ""} ready to import
                      </p>
                    )}
                  </div>

                  {bulkRows.length > 0 && !bulkParseError && (
                    <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-[#0c1427] text-slate-500 dark:text-slate-400">
                            <tr>
                              <th className="text-left font-semibold px-3 py-2">Employee ID</th>
                              <th className="text-left font-semibold px-3 py-2">Name</th>
                              <th className="text-left font-semibold px-3 py-2">Location</th>
                              <th className="text-left font-semibold px-3 py-2">Role</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                            {bulkRows.map((r, i) => (
                              <tr key={i} className={!r.employee_id ? "bg-red-50/60 dark:bg-red-500/[0.06]" : ""}>
                                <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                                  {r.employee_id || <span className="text-red-500">missing</span>}
                                </td>
                                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{r.employee_name || "—"}</td>
                                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{r.location || "—"}</td>
                                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{r.role_name || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-1.5 text-[11px] text-slate-400 bg-slate-50 dark:bg-white/[0.02] dark:text-slate-500 border-t border-slate-100 dark:border-white/[0.06]">
                        {bulkRows.length} row{bulkRows.length !== 1 ? "s" : ""} total
                      </div>
                    </div>
                  )}

                  {bulkRows.length > 0 && !bulkParseError && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs text-slate-600 dark:text-slate-300">
                      <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>
                        Every imported user gets the default password{" "}
                        <b className="font-mono font-bold text-amber-700 dark:text-amber-300">{defaultPassword || "…"}</b>. Rows
                        with a duplicate or invalid Employee ID, or a Role name that doesn't match an existing role,
                        will fail individually without affecting the rest.
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    {bulkResult.created > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        {bulkResult.created} created
                      </div>
                    )}
                    {bulkResult.reactivated > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 text-sky-700 dark:text-sky-400 text-xs font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        {bulkResult.reactivated} reactivated
                      </div>
                    )}
                    {bulkResult.failed > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold">
                        <AlertCircle className="w-4 h-4" />
                        {bulkResult.failed} failed
                      </div>
                    )}
                  </div>

                  {bulkResult.failed > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 sticky top-0">
                          <tr>
                            <th className="text-left font-semibold px-3 py-2">Row</th>
                            <th className="text-left font-semibold px-3 py-2">Employee ID</th>
                            <th className="text-left font-semibold px-3 py-2">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                          {bulkResult.rows.filter((r) => r.status === "error").map((r) => (
                            <tr key={r.row}>
                              <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{r.row}</td>
                              <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.employee_id || "—"}</td>
                              <td className="px-3 py-1.5 text-red-600 dark:text-red-400">{r.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>

            <ModalFooter>
              <ModalCancelButton onClick={handleCloseBulk}>{bulkResult ? "Done" : "Cancel"}</ModalCancelButton>
              {!bulkResult && (
                <button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={bulkSubmitting || bulkRows.length === 0 || !!bulkParseError}
                  className={PRIMARY_BUTTON}
                >
                  <Upload className="w-4 h-4" />
                  {bulkSubmitting ? "Importing..." : `Import ${bulkRows.length || ""} User${bulkRows.length !== 1 ? "s" : ""}`}
                </button>
              )}
            </ModalFooter>
        </Modal>
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
          <EmptyState
            icon={Users}
            title="No users yet"
            description="Add people one at a time, or import a CSV with Bulk Import."
            action={
              <button onClick={() => handleOpenModal()} className={PRIMARY_BUTTON}>
                <Plus className="w-4 h-4" />
                Add User
              </button>
            }
          />
        ) : (
          <div className="flex flex-col">
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.04] m-0 p-0">
              {table.paged.map((user, index) => (
                <li key={user.id} className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 px-6 py-3.5 hover:bg-white/35 dark:hover:bg-white/[0.03] transition-colors">

                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* S.No */}
                    <div className="w-8 shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500 text-center">
                      {(table.page - 1) * table.pageSize + index + 1}
                    </div>

                    {/* Avatar */}
                    <div
                      aria-hidden="true"
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold tracking-wide ${user.is_active
                        ? "text-white bg-gradient-to-br from-[#00c6ff] to-[#0072ff] shadow-[0_2px_8px_rgba(0,132,255,0.3)]"
                        : "text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-white/10"
                        }`}
                    >
                      {initials(user.employee_name || user.employee_id)}
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
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto pl-11 sm:pl-0">
                    <RowActionButton label={`Edit ${user.employee_name || user.employee_id}`} onClick={() => handleOpenModal(user)}>
                      <Edit2 className="w-4 h-4" />
                    </RowActionButton>
                    <RowActionButton
                      label={`${user.is_active ? "Deactivate" : "Activate"} ${user.employee_name || user.employee_id}`}
                      onClick={() => handleToggleStatus(user)}
                    >
                      {user.is_active ? <ToggleRight className="w-5 h-5 text-sky-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </RowActionButton>
                    <RowActionButton label={`Remove ${user.employee_name || user.employee_id}`} tone="danger" onClick={() => handleDelete(user)}>
                      <Trash2 className="w-4 h-4" />
                    </RowActionButton>
                  </div>
                </li>
              ))}
            </ul>

            {table.filtered.length === 0 && (
              <EmptyState compact icon={Search} title="No matching users" description="Try a name, Employee ID, location or role." />
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
          title="Deactivate user?"
          message={
            <>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {itemToDelete.employee_name || itemToDelete.employee_id}
              </span>{" "}
              loses access immediately, but stays listed as Inactive and can be re-enabled later.
            </>
          }
          confirmLabel="Deactivate"
          busyLabel="Deactivating..."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setItemToDelete(null)}
        />
      )}
    </PageContainer>
  );
}
