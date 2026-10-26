import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search, X } from "lucide-react";
import { fetchMenus, type MenuItem } from "@/services/menu";
import { useLive } from "@/context/LiveContext";
import { useMyStages } from "@/hooks/useMyStages";

interface SearchEntry {
  path: string;
  label: string;
  group: string;
}

interface Props {
  isDeveloper: boolean;
}

// Mirrors the Developer's hard-coded sidebar screens (see Sidebar.tsx), which aren't guaranteed to be in /api/menus.
const DEV_SCREENS: SearchEntry[] = [
  { path: "/dashboard", label: "Dashboard", group: "Main Menu" },
  { path: "/developer-management/router-setup", label: "Router Setup", group: "Developer Management" },
  { path: "/access-control/role-management", label: "Role Management", group: "Access Control" },
  { path: "/access-control/user-management", label: "User Management", group: "Access Control" },
  { path: "/access-control/menu-access", label: "Menu Access", group: "Access Control" },
  { path: "/access-control/workflow-management", label: "Workflow Management", group: "Access Control" },
  { path: "/project-config", label: "Project Config", group: "Project Config" },
  { path: "/support", label: "Support", group: "Support" },
];

/**
 * Global screen search for the top bar. The index is built from what this user can actually open
 * (their menus + workflow stages, same sources as the sidebar), so results are always permitted
 * screens and update live when access changes. Filtering happens as you type.
 */
export default function SearchBar({ isDeveloper }: Props) {
  const navigate = useNavigate();
  const { accessVersion } = useLive();
  const { workflows, routes } = useMyStages();
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMenus()
      .then((list) => !cancelled && setMenus(list))
      .catch(() => !cancelled && setMenus([]));
    return () => {
      cancelled = true;
    };
  }, [accessVersion]);

  const entries = useMemo<SearchEntry[]>(() => {
    const byPath = new Map<string, SearchEntry>();
    if (isDeveloper) DEV_SCREENS.forEach((e) => byPath.set(e.path, e));
    menus
      .filter((m) => m.url && m.is_active)
      .forEach((m) => {
        if (!byPath.has(m.url)) byPath.set(m.url, { path: m.url, label: m.name, group: m.process?.name ?? "Screens" });
      });
    routes.forEach((r) => {
      const wf = workflows.find((w) => w.id === r.workflowId);
      const stage = wf?.stages.find((s) => s.id === r.stageId);
      if (wf && stage) byPath.set(r.path, { path: r.path, label: stage.name, group: `Workflow · ${wf.name}` });
    });
    return [...byPath.values()];
  }, [menus, routes, workflows, isDeveloper]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries
      .map((e) => {
        const label = e.label.toLowerCase();
        const group = e.group.toLowerCase();
        // Lower rank = better: label prefix, label word prefix, label contains, group contains.
        const rank = label.startsWith(q)
          ? 0
          : label.split(/\s+/).some((w) => w.startsWith(q))
            ? 1
            : label.includes(q)
              ? 2
              : group.includes(q)
                ? 3
                : -1;
        return { e, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.e.label.localeCompare(b.e.label))
      .slice(0, 8)
      .map((x) => x.e);
  }, [entries, query]);

  useEffect(() => setActive(0), [query]);

  // Close on outside click; Ctrl/Cmd+K focuses the box from anywhere.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function go(entry: SearchEntry) {
    navigate(entry.path);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative hidden md:block w-64 lg:w-80 shrink-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search screens…  (Ctrl+K)"
        aria-label="Search screens"
        className="w-full h-9 pl-9 pr-8 rounded-xl text-[13px] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 bg-white/60 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 outline-none focus:border-[#0084ff]/60 focus:ring-2 focus:ring-[#0084ff]/20 transition"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-2 glass-menu rounded-2xl overflow-hidden z-50">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No screens match “{query.trim()}”</p>
          ) : (
            <ul role="listbox" className="py-1.5">
              {results.map((r, i) => (
                <li key={r.path} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left transition-colors ${i === active ? "bg-sky-50 dark:bg-white/10" : ""
                      }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">{r.label}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.group}</span>
                    </span>
                    {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
