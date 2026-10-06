
import { useEffect, useRef, useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Edit2,
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
  createUser,
  updateUser,
  deleteUser,
  UserCreatePayload,
  bulkImportUsers,
  BulkUserInput,
  BulkImportResult,
} from "@/services/user";
import { RoleItem, fetchRoles } from "@/services/role";
import { createPortal } from "react-dom";
import { TablePagination, TableSearchInput, TableExportButton } from "@/components/DataTableControls";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { CustomSelect } from "@/components/CustomSelect";
import { useTableData } from "@/hooks/useTableData";
import { exportToCsv } from "@/lib/exportData";
import { parseCsv, mapCsvColumns } from "@/lib/importCsv";

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

  function handleOpenBulk() {
    setBulkFileName("");
    setBulkRows([]);
    setBulkParseError("");
    setBulkResult(null);
    setIsBulkOpen(true);
  }

  function handleDownloadTemplate() {
    exportToCsv(
      "user_import_template",
      [
        { header: "Employee ID", value: (r: Record<string, string>) => r.employee_id },
        { header: "Employee Name", value: (r: Record<string, string>) => r.employee_name },
        { header: "Location", value: (r: Record<string, string>) => r.location },
        { header: "Role", value: (r: Record<string, string>) => r.role },
      ],
      [{ employee_id: "MAH1234", employee_name: "Jane Doe", location: "New York Office", role: "Admin" }]
    );
  }

  async function processBulkFile(file: File) {
    setBulkResult(null);
    setBulkFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setBulkRows([]);
      setBulkParseError("Please upload a .csv file.");
      return;
    }
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setBulkRows([]);
        setBulkParseError("That file has no data rows below the header.");
        return;
      }
      const [header, ...dataRows] = rows;
      const colIndex = mapCsvColumns(header, BULK_IMPORT_COLUMNS);
      if (colIndex.employee_id === undefined) {
        setBulkRows([]);
        setBulkParseError('Couldn\'t find an "Employee ID" column in that file\'s header row.');
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
      setBulkParseError("Couldn't read that file. Make sure it's a .csv export.");
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
      if (result.created > 0) await loadUsers();
      if (result.failed === 0) {
        // Nothing for the user to review -- close and report it the same way a single Add User does.
        handleCloseBulk();
        setSuccess(`${result.created} user${result.created !== 1 ? "s" : ""} imported successfully`);
        setTimeout(() => setSuccess(""), 4000);
      } else {
        setBulkResult(result);
      }
    } catch (err) {
      setBulkParseError(err instanceof Error ? err.message : "Bulk import failed");
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
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleOpenBulk}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 glass-btn border border-slate-200 dark:border-white/10 rounded-xl hover:text-sky-600 dark:hover:text-sky-400 transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Bulk Import
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="group relative flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            </div>
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

      {/* Bulk Import Modal */}
      {isBulkOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="glass-modal rounded-2xl w-full max-w-2xl overflow-visible">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between rounded-t-2xl bg-white/30 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-sky-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Bulk Import Users</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseBulk}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
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

                  {bulkParseError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {bulkParseError}
                    </div>
                  )}

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
                        <b className="font-mono font-bold text-amber-700 dark:text-amber-300">Admin@123#</b>. Rows
                        with a duplicate or invalid Employee ID, or a Role name that doesn't match an existing role,
                        will fail individually without affecting the rest.
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      {bulkResult.created} created
                    </div>
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
            </div>

            <div className="px-6 py-4 bg-white/30 dark:bg-white/[0.03] border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-3 shrink-0 rounded-b-2xl">
              <button
                type="button"
                onClick={handleCloseBulk}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                {bulkResult ? "Done" : "Cancel"}
              </button>
              {!bulkResult && (
                <button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={bulkSubmitting || bulkRows.length === 0 || !!bulkParseError}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 transition-all disabled:opacity-60 shadow-sm"
                >
                  <Upload className="w-4 h-4" />
                  {bulkSubmitting ? "Importing..." : `Import ${bulkRows.length || ""} User${bulkRows.length !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>
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
