import PageContainer from "@/components/PageContainer";

/** Placeholder shaped like the Dashboard: header, four stat cards, and the two panels underneath. */
export default function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="flex items-center gap-3.5 animate-pulse" aria-hidden="true">
        <div className="w-11 h-11 rounded-2xl bg-slate-200 dark:bg-white/10 shrink-0" />
        <div className="space-y-2">
          <div className="h-6 w-40 bg-slate-200 dark:bg-white/10 rounded-md" />
          <div className="h-3 w-64 bg-slate-100 dark:bg-white/5 rounded" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-card rounded-2xl p-5 flex items-center gap-4 animate-pulse">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-white/10 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-6 w-14 bg-slate-200 dark:bg-white/10 rounded" />
              <div className="h-3 w-24 bg-slate-100 dark:bg-white/5 rounded" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" aria-hidden="true">
        <div className="glass-card rounded-2xl p-5 space-y-2 animate-pulse">
          <div className="h-4 w-28 bg-slate-200 dark:bg-white/10 rounded mb-4" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 rounded-xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 space-y-3 animate-pulse">
          <div className="h-4 w-36 bg-slate-200 dark:bg-white/10 rounded mb-4" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/2 bg-slate-200 dark:bg-white/10 rounded" />
                <div className="h-3 w-1/3 bg-slate-100 dark:bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">Loading dashboard</span>
    </PageContainer>
  );
}
