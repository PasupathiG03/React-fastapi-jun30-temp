import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Image as ImageIcon,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Sliders,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import {
  fetchDashboardSummary,
  type DashboardSummary,
} from "@/services/bigbasket";
import { showError } from "@/lib/toast";

export default function BigBasketDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadSummary() {
    try {
      const data = await fetchDashboardSummary();
      setSummary(data);
    } catch (e: any) {
      showError(e.message || "Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }

  const kpis = [
    {
      title: "Total Batches",
      value: summary?.total_batches ?? 0,
      icon: Layers,
      color: "from-sky-500 to-blue-600",
      change: "Active in catalog",
    },
    {
      title: "Processed Images",
      value: summary?.total_images ?? 0,
      icon: ImageIcon,
      color: "from-blue-500 to-indigo-600",
      change: "2000x2000 150 DPI",
    },
    {
      title: "Auto-Approved",
      value: summary?.auto_approved_images ?? 0,
      pct: summary?.auto_approval_rate ?? 0,
      icon: CheckCircle2,
      color: "from-emerald-500 to-teal-600",
      change: `${summary?.auto_approval_rate ?? 0}% confidence met`,
    },
    {
      title: "Awaiting Review",
      value: summary?.review_needed_images ?? 0,
      icon: AlertTriangle,
      color: "from-amber-500 to-orange-600",
      change: "Flagged for inspection",
    },
    {
      title: "Failed Items",
      value: summary?.failed_images ?? 0,
      icon: XCircle,
      color: "from-rose-500 to-red-600",
      change: "Requires retry",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        icon={Sparkles}
        title="Image Studio"
        subtitle="Catalog image background removal, precision FOP/BOP padding, and automated quality validation"
        actions={
          <div className="flex items-center gap-3">
            <Link to="/image-studio/review-studio" className={SECONDARY_BUTTON}>
              <Sliders className="w-4 h-4 text-sky-500" />
              Review Studio
            </Link>
            <Link to="/image-studio/create-batch" className={PRIMARY_BUTTON}>
              <PlusCircle className="w-4 h-4" />
              Create New Batch
            </Link>
          </div>
        }
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={idx} className="glass-card rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {kpi.title}
                </span>
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center text-white shadow-sm`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {loading ? "..." : kpi.value.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                  <span>{kpi.change}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Overview & Recent Batches */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Quick Workflow Cards */}
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-500" />
              Image Studio SLA Standard
            </h2>
            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-white/5">
                <span className="text-slate-500">Canvas Dimensions</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">2000 × 2000 px (1:1)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-white/5">
                <span className="text-slate-500">Color Profile & DPI</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">RGB, 150 DPI minimum</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-white/5">
                <span className="text-slate-500">FOP & BOP Framing</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">180px T/B, 100px L/R</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-white/5">
                <span className="text-slate-500">Nutritional / Info Framing</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">0px (Edge-to-Edge)</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Auto-Approval Threshold</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">100% Accuracy Confidence</span>
              </div>
            </div>
            <div className="pt-2">
              <Link
                to="/image-studio/create-batch"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors"
              >
                Launch Ingestion Wizard
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Batches Table */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Image Batches</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Batches currently tracked in the pipeline</p>
            </div>
            <Link
              to="/image-studio/batch-processing"
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
            >
              View All Batches
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 font-semibold">Batch Code</th>
                  <th className="py-2.5 px-3 font-semibold">Name</th>
                  <th className="py-2.5 px-3 font-semibold">Source</th>
                  <th className="py-2.5 px-3 font-semibold">Progress</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      Loading batches...
                    </td>
                  </tr>
                ) : !summary?.recent_batches?.length ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No batches created yet. Click "Create New Batch" to begin.
                    </td>
                  </tr>
                ) : (
                  summary.recent_batches.map((b) => {
                    const pct = b.total_images > 0 ? Math.round((b.processed_images / b.total_images) * 100) : 0;
                    return (
                      <tr key={b.id} className="hover:bg-slate-500/5 transition-colors">
                        <td className="py-3 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                          {b.batch_code}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-900 dark:text-white truncate max-w-[180px]">
                          {b.name}
                        </td>
                        <td className="py-3 px-3 text-slate-500 capitalize">
                          {b.source_type.replace("_", " ")}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-sky-500 to-blue-600 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-500">{pct}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
                              b.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : b.status === "processing"
                                ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 animate-pulse"
                                : b.status === "failed"
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20"
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            to="/image-studio/batch-processing"
                            state={{ batchId: b.id }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700"
                          >
                            Open
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
