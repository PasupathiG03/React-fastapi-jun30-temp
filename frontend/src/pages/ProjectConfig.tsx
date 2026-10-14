import { Cog } from "flowbite-react-icons/outline";
import PageContainer, { PageHeader } from "@/components/PageContainer";

export default function ProjectConfig() {
  return (
    <PageContainer>
      <PageHeader icon={Cog} title="Project Config" subtitle="Project-wide settings" />
      <div className="glass-card rounded-[22px] p-12 flex flex-col items-center text-center gap-2">
        <Cog className="w-10 h-10 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nothing to configure yet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
          This page is a placeholder — project settings will go here.
        </p>
      </div>
    </PageContainer>
  );
}
