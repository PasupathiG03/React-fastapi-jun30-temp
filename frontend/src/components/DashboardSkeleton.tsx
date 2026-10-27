import PageContainer from "@/components/PageContainer";

/** Placeholder shaped like the Dashboard: welcome card, four stat cards, and the two panels underneath. */
export default function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="glass-card rounded-[22px] p-5 sm:p-7 flex items-center gap-4 animate-pulse" aria-hidden="true">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-200 dark:bg-white/10 shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-3 w-36 bg-slate-100 dark:bg-white/5 rounded" />
          <div className="h-6 w-56 max-w-full bg-slate-200 dark:bg-white/10 rounded-md" />
          <div className="h-3 w-64 max-w-full bg-slate-100 dark:bg-white/5 rounded" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-card rounded-2xl p-5 animate-pulse">
            <div className="w-11 h-11 rounded-2xl bg-slate-200 dark:bg-white/10" />
            <div className="mt-4 h-8 w-16 bg-slate-200 dark:bg-white/10 rounded" />
            <div className="mt-2 h-3 w-24 bg-slate-100 dark:bg-white/5 rounded" />
            <div className="mt-2 h-2.5 w-20 bg-slate-100 dark:bg-white/5 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" aria-hidden="true">
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 dark:bg-white/10 rounded" />
          <div className="h-3 w-40 bg-slate-100 dark:bg-white/5 rounded mt-2 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-[60px] rounded-xl bg-slate-100 dark:bg-white/5" />
            ))}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 space-y-4 animate-pulse">
          <div className="h-4 w-36 bg-slate-200 dark:bg-white/10 rounded" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 bg-slate-100 dark:bg-white/5 rounded" />
              <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">Loading dashboard</span>
    </PageContainer>
  );
}
