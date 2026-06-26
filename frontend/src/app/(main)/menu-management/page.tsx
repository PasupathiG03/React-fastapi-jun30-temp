"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { ChevronDown, Plus, Trash2, ToggleLeft, ToggleRight, X, GripVertical, Copy, CheckCircle2, Download, Upload } from "lucide-react";
import { Cog } from "flowbite-react-icons/outline";
import { ICON_MAP, ICON_OPTIONS } from "@/lib/icons";
import {
  createMenu,
  deleteMenu,
  fetchAllMenus,
  updateMenu,
  updateMenuOrders,
  type MenuItem,
  type MenuUpdatePayload,
} from "@/services/menu";
import { createPortal } from "react-dom";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Icon Dropdown ──────────────────────────────────────────────────────────

interface IconDropdownProps {
  value: string;
  onChange: (name: string) => void;
}

function IconDropdown({ value, onChange }: IconDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = search
    ? ICON_OPTIONS.filter((o) =>
        o.name.toLowerCase().includes(search.toLowerCase())
      )
    : ICON_OPTIONS;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = value ? ICON_OPTIONS.find((o) => o.name === value) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
      >
        <span className="flex items-center gap-2">
          {selected ? (
            <>
              <selected.Icon className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-medium text-gray-800">{selected.name}</span>
            </>
          ) : (
            <span className="text-gray-400">Select an icon</span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              placeholder="Search icons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 text-center">No icons found</p>
            ) : (
              filtered.map(({ name, Icon }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                    value === name ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-blue-500" />
                  <span>{name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function MenuManagementPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [url, setUrl] = useState("");
  const [urlEdited, setUrlEdited] = useState(false);
  const [order, setOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadMenus();
  }, []);

  async function loadMenus() {
    try {
      await new Promise(r => setTimeout(r, 600)); // Show skeleton loader
      const data = await fetchAllMenus();
      setMenus(data);
    } catch {
      // silently fail — non-superusers get 403
    } finally {
      setLoadingMenus(false);
    }
  }

  // Auto-generate URL from name unless user manually edited it
  useEffect(() => {
    if (!urlEdited) {
      setUrl(name ? `/${toSlug(name)}` : "");
    }
  }, [name, urlEdited]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) return setError("Menu name is required");
    if (!icon) return setError("Please select an icon");
    if (!url.trim()) return setError("URL is required");

    setSubmitting(true);
    try {
      const created = await createMenu({ name: name.trim(), icon, url: url.trim(), order });
      setMenus((prev) => [...prev, created].sort((a, b) => a.order - b.order || a.id - b.id));
      setName("");
      setIcon("");
      setUrl("");
      setUrlEdited(false);
      setOrder(0);
      setSuccess(`"${created.name}" added to sidebar`);
      setIsModalOpen(false);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create menu");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(menu: MenuItem) {
    try {
      const updated = await updateMenu(menu.id, { is_active: !menu.is_active });
      setMenus((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {
      setError("Failed to update menu");
    }
  }

  async function handleDelete(menu: MenuItem) {
    if (!confirm(`Delete "${menu.name}"?`)) return;
    try {
      await deleteMenu(menu.id);
      setMenus((prev) => prev.filter((m) => m.id !== menu.id));
    } catch {
      setError("Failed to delete menu");
    }
  }

  const handleCopy = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(menus.length / ITEMS_PER_PAGE);
  const paginatedMenus = menus.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  async function handleReorder(newOrderSlice: MenuItem[]) {
    const updatedMenus = [...menus];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    
    updatedMenus.splice(startIndex, ITEMS_PER_PAGE, ...newOrderSlice);
    updatedMenus.forEach((m, i) => m.order = i + 1);
    setMenus(updatedMenus);

    const payload = updatedMenus.map(m => ({ id: m.id, order: m.order }));
    try {
      await updateMenuOrders(payload);
    } catch {
      setError("Failed to save new menu order");
    }
  }

  // ── Export menus as JSON ──────────────────────────────────────────────────
  function handleExport() {
    const exportData = menus.map(({ name, icon, url, order, is_active }) => ({
      name,
      icon,
      url,
      order,
      is_active,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const link = window.document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `menu-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ── Import menus from JSON ────────────────────────────────────────────────
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Invalid format: expected an array");

      setSubmitting(true);
      setError("");
      let imported = 0;
      for (const item of parsed) {
        if (!item.name || !item.icon || !item.url) continue;
        try {
          const created = await createMenu({
            name: item.name,
            icon: item.icon,
            url: item.url,
            order: item.order ?? 0,
          });
          setMenus((prev) => [...prev, created].sort((a, b) => a.order - b.order || a.id - b.id));
          imported++;
        } catch {
          // skip duplicates / invalid items
        }
      }
      setSuccess(`Successfully imported ${imported} menu item${imported !== 1 ? "s" : ""}`);
      setTimeout(() => setSuccess(""), 4000);
      loadMenus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import JSON");
    } finally {
      setSubmitting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  return (
    <div className="p-6 w-full space-y-6">
      {/* Header */}
      {loadingMenus ? (
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
              <Cog className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Menu Management</h1>
              <p className="text-sm text-gray-500">Add and manage sidebar navigation items</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Hidden file input for import */}
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={menus.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 text-gray-500" />
              Export
            </button>
            {/* Import Button */}
            <button
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4 text-gray-500" />
              Import
            </button>
            {/* Add Menu Item */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:shadow-md hover:opacity-90 transition-all shadow-sm"
              style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
            >
              <Plus className="w-4 h-4" />
              Add Menu Item
            </button>
          </div>
        </div>
      )}

      {/* Create Form Modal */}
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
                <Plus className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-gray-800">Add New Menu Item</h2>
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
            {/* Menu Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Menu Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Reports, Analytics"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Icon Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Icon <span className="text-red-500">*</span>
              </label>
              <IconDropdown value={icon} onChange={setIcon} />
            </div>

            {/* URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Page URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlEdited(true);
                }}
                onFocus={() => setUrlEdited(true)}
                placeholder="/your-page"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors font-mono"
              />
              <p className="text-xs text-gray-400">Auto-generated from name · editable</p>
            </div>

            {/* Order */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Display Order
              </label>
              <input
                type="number"
                value={order}
                min={0}
                onChange={(e) => setOrder(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              />
              <p className="text-xs text-gray-400">Lower numbers appear first</p>
            </div>
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
                  <Plus className="w-5 h-5" />
                  {submitting ? "Adding..." : "Add Menu Item"}
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

      {/* Menus List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loadingMenus ? (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-12 bg-gray-100 rounded" />
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Existing Menu Items</h2>
            <span className="text-xs text-gray-400">{menus.length} item{menus.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {loadingMenus ? (
          <div className="divide-y divide-gray-50 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                {/* Drag Handle Skeleton */}
                <div className="w-4 h-4 bg-gray-100 rounded shrink-0" />
                
                {/* S.No Skeleton */}
                <div className="w-8 shrink-0 flex justify-center">
                  <div className="w-3 h-4 bg-gray-100 rounded" />
                </div>

                {/* Icon Box Skeleton */}
                <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />

                {/* Info Skeleton */}
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3.5 w-32 bg-gray-200 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>

                {/* Order Badge Skeleton (hidden on small screens) */}
                <div className="hidden sm:block shrink-0">
                  <div className="h-4 w-12 bg-gray-100 rounded" />
                </div>

                {/* Status Badge Skeleton */}
                <div className="h-6 w-16 bg-green-50 rounded-full shrink-0" />

                {/* Toggle Button Skeleton */}
                <div className="w-5 h-5 bg-gray-100 rounded-full shrink-0" />

                {/* Delete Button Skeleton */}
                <div className="w-4 h-4 bg-gray-100 rounded shrink-0" />
              </div>
            ))}
          </div>
        ) : menus.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Cog className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No menu items yet</p>
            <p className="text-xs mt-0.5">Add your first menu item above</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <Reorder.Group axis="y" values={paginatedMenus} onReorder={handleReorder} className="divide-y divide-gray-50 list-none m-0 p-0">
              {paginatedMenus.map((menu, index) => {
                const Icon = ICON_MAP[menu.icon];
                return (
                  <Reorder.Item
                    key={menu.id}
                    value={menu}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors bg-white cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical className="w-4 h-4 text-gray-300" />
                    
                    {/* S.No */}
                    <div className="w-8 shrink-0 text-sm font-medium text-gray-400 text-center">
                      {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                    </div>

                    {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: menu.is_active
                        ? "linear-gradient(135deg, rgba(29,85,232,0.12), rgba(18,53,176,0.08))"
                        : "rgba(0,0,0,0.04)",
                    }}
                  >
                    {Icon ? (
                      <Icon
                        className={`w-4 h-4 ${menu.is_active ? "text-blue-600" : "text-gray-400"}`}
                      />
                    ) : (
                      <Cog className="w-4 h-4 text-gray-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${
                        menu.is_active ? "text-gray-800" : "text-gray-400"
                      }`}
                    >
                      {menu.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="text-xs text-gray-400 font-mono mt-0.5">{menu.url}</div>
                      <button
                        onClick={() => handleCopy(menu.url, menu.id)}
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                        title="Copy URL"
                      >
                        {copiedId === menu.id ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    {menu.created_at && (
                      <div className="text-[10px] text-gray-400 mt-1">
                        Added by {menu.creator?.employee_name || menu.creator?.employee_id || "System"} on {new Date(menu.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {/* Order badge */}
                  <span className="text-xs text-gray-400 hidden sm:block shrink-0">
                    Order: {menu.order}
                  </span>

                  {/* Status badge */}
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                      menu.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {menu.is_active ? "Active" : "Hidden"}
                  </span>

                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(menu)}
                    title={menu.is_active ? "Deactivate" : "Activate"}
                    className="text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                  >
                    {menu.is_active ? (
                      <ToggleRight className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(menu)}
                    title="Delete menu"
                    className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  </Reorder.Item>
              );
            })}
            </Reorder.Group>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <span className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, menus.length)} of {menus.length} entries
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
