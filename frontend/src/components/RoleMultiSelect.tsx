import { Check } from "lucide-react";
import type { RoleItem } from "@/services/role";

/** Pick which roles may open a workflow stage. Rendered as toggleable chips. */
export default function RoleMultiSelect({
  roles,
  value,
  onChange,
  loading = false,
}: {
  roles: RoleItem[];
  value: number[];
  onChange: (ids: number[]) => void;
  loading?: boolean;
}) {
  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  if (loading) {
    return <p className="text-[11px] text-slate-400 dark:text-slate-500">Loading roles...</p>;
  }
  if (roles.length === 0) {
    return <p className="text-[11px] text-slate-400 dark:text-slate-500">No roles available.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((role) => {
        const selected = value.includes(role.id);
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => toggle(role.id)}
            aria-pressed={selected}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              selected
                ? "bg-sky-500/10 border-sky-500/50 text-sky-700 dark:text-sky-300"
                : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
            }`}
          >
            {selected && <Check className="w-3 h-3" />}
            {role.name}
          </button>
        );
      })}
    </div>
  );
}
