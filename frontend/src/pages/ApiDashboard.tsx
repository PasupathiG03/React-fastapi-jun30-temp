import { useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  LineChart as LineChartIcon,
  ShieldCheck,
  Users,
  CheckCircle2,
} from "lucide-react";
import PageContainer from "@/components/PageContainer";
import {
  fetchApiOverview,
  fetchApiUsage,
  getExportCsvUrl,
  type OverviewData,
  type UsageData,
  type TimeseriesPoint,
} from "@/services/apiDashboard";
import { showError, showSuccess } from "@/lib/toast";

export default function ApiDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "usage">("overview");

  // Overview data state
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [planMode, setPlanMode] = useState<"free_trial" | "sandbox">("free_trial");

  // Usage tab state & filters
  const [days, setDays] = useState(7);
  const [interval, setInterval] = useState("daily");
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [viewMode, setViewMode] = useState<"chart" | "table">("table");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [isChartTypeOpen, setIsChartTypeOpen] = useState(false);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (activeTab === "usage") {
      loadUsage();
    }
  }, [activeTab, days, interval]);

  async function loadOverview(plan?: string) {
    try {
      const data = await fetchApiOverview(plan);
      setOverview(data);
      if (!plan && data.detected_plan) {
        setPlanMode(data.detected_plan);
      }
    } catch (e: any) {
      showError(e.message || "Failed to load API overview");
    }
  }

  async function loadUsage() {
    try {
      const data = await fetchApiUsage({ days, interval });
      setUsage(data);
    } catch (e: any) {
      showError(e.message || "Failed to load API usage breakdown");
    }
  }

  function handleExportCsv() {
    window.open(getExportCsvUrl(days), "_blank");
    showSuccess(`Exporting API usage breakdown for last ${days} days...`);
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Top Header & Navigation */}
        <div className="space-y-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            API Dashboard
          </h1>

          {/* Clean Pill Tabs: ONLY Overview and Usage */}
          <div className="inline-flex items-center gap-1.5 p-1 rounded-full bg-slate-100 dark:bg-slate-900/80 border border-slate-200/80 dark:border-white/10 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeTab === "overview"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("usage")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeTab === "usage"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Usage
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            OVERVIEW TAB
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Main Overview Grid: Left Stats & Chart (8 cols) + Right Plan Card (4 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (8 cols): 3 Stat Cards + API Calls Timeseries Chart */}
              <div className="lg:col-span-8 space-y-6">
                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Images used */}
                  <div className="glass-card rounded-2xl p-5 space-y-1">
                    <div className="text-xs font-semibold text-sky-500 dark:text-sky-400">
                      Images used
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                      {overview?.images_used ?? 0}
                    </div>
                    <div className="text-[11px] pt-2 flex items-center justify-between">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {overview?.successful_calls ?? 0} successful
                      </span>
                      {overview?.failed_calls ? (
                        <span className="text-rose-500 font-bold">
                          {overview.failed_calls} failed
                        </span>
                      ) : (
                        <span className="text-slate-400">0 failed</span>
                      )}
                    </div>
                  </div>

                  {/* Projected this month */}
                  <div className="glass-card rounded-2xl p-5 space-y-1">
                    <div className="text-xs font-semibold text-sky-500 dark:text-sky-400">
                      Projected this month
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                      {overview?.projected_this_month ?? "—"}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2">
                      Based on current pace
                    </div>
                  </div>

                  {/* Daily average */}
                  <div className="glass-card rounded-2xl p-5 space-y-1">
                    <div className="text-xs font-semibold text-sky-500 dark:text-sky-400">
                      Daily average
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                      {overview?.daily_average ? overview.daily_average : "—"}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2">
                      Across this billing period
                    </div>
                  </div>
                </div>

                {/* API Calls Timeseries Chart Card */}
                <div className="glass-card rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">API calls</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Track API usage over time</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("usage")}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                    >
                      View details
                    </button>
                  </div>

                  {/* Interactive SVG Line & Area Chart */}
                  <div className="w-full h-64 pt-2">
                    <TimeseriesChart
                      data={overview?.timeseries || []}
                      series1Key="basic_plan_images"
                      series1Color="#3b82f6"
                    />
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-6 pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span>Basic plan images</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column (4 cols): Photoroom Plan Quota Card */}
              <div className="lg:col-span-4">
                <div className="glass-card rounded-2xl p-6 h-full flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    {/* Plan Mode Switcher Pills */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Photoroom Plan
                      </span>
                      <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                        <button
                          type="button"
                          onClick={() => setPlanMode("free_trial")}
                          className={`px-2.5 py-1 rounded-md transition-all ${
                            planMode === "free_trial"
                              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold shadow-xs"
                              : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          }`}
                        >
                          Free trial (10)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlanMode("sandbox")}
                          className={`px-2.5 py-1 rounded-md transition-all ${
                            planMode === "sandbox"
                              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold shadow-xs"
                              : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          }`}
                        >
                          Sandbox (1,000)
                        </button>
                      </div>
                    </div>

                    {/* Plan Title & Numbers exactly matching screenshot */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {planMode === "free_trial" ? "Free trial" : "Sandbox mode"}
                        </h3>
                        {planMode === "sandbox" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            Active in .env
                          </span>
                        )}
                      </div>
                      <div className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white pt-1">
                        {overview?.images_used ?? 0}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {planMode === "free_trial"
                          ? "of 10 images this month"
                          : "of 1,000 credits this month"}
                      </p>
                    </div>

                    {/* Purple/Indigo Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mt-3">
                      <div
                        className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            (((overview?.images_used || 0) / (planMode === "free_trial" ? 10 : 1000)) * 100)
                          )}%`,
                        }}
                      />
                    </div>

                    {/* Left text */}
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {planMode === "free_trial"
                        ? `${Math.max(0, 10 - (overview?.images_used ?? 0))} of 10 images left`
                        : `${Math.max(0, 1000 - (overview?.images_used ?? 0)).toLocaleString()} of 1,000 credits left`}
                    </p>

                    {/* Remaining Credit Breakdown Card (No Upgrade button) */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-white/5 space-y-2.5 mt-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Credits Remaining</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {planMode === "free_trial"
                            ? `${Math.max(0, 10 - (overview?.images_used ?? 0))} images`
                            : `${Math.max(0, 1000 - (overview?.images_used ?? 0)).toLocaleString()} credits`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Used This Month</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {overview?.images_used ?? 0} {planMode === "free_trial" ? "images" : "credits"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Total Monthly Quota</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {planMode === "free_trial" ? "10 images" : "1,000 credits"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200/60 dark:border-white/5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Quota Status</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" /> Within Limit
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Image Editing API Section */}
                  <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Image Editing API
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Provider:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Photoroom</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>API Mode:</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {overview?.is_sandbox_key ? "Sandbox (sk_pr_test_)" : "Live (Production)"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Monthly Quota:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {planMode === "free_trial" ? "10 images / month" : "1,000 credits / month"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Request Breakdown By Each User & Compliance Monitor */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-500" />
                    User API Consumption & Quota Monitor
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    How many requests have been done by each user with API calls & remaining quota
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" /> Copyright Compliant
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4 text-right">Total Requests</th>
                      <th className="py-3 px-4 text-right">Successful</th>
                      <th className="py-3 px-4 text-right">Failed</th>
                      <th className="py-3 px-4 text-right">Success Rate</th>
                      <th className="py-3 px-4 text-center">Audit Status</th>
                      <th className="py-3 px-4 text-right">Last Request</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium">
                    {overview?.user_usage && overview.user_usage.length > 0 ? (
                      overview.user_usage.map((u) => (
                        <tr key={u.user_id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold flex items-center justify-center text-xs">
                                {u.employee_name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {u.employee_name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  ID: {u.employee_id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {u.role_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                            {u.total_requests}
                          </td>
                          <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                            {u.success_requests}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            <span className={u.failed_requests > 0 ? "text-rose-500 font-bold" : "text-slate-400"}>
                              {u.failed_requests}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-bold text-sky-600 dark:text-sky-400">
                              {u.success_rate}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              {u.compliance_status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 text-[11px]">
                            {u.last_active ? new Date(u.last_active).toLocaleString() : "Never"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No user API requests recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            USAGE TAB
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === "usage" && (
          <div className="space-y-6">
            {/* Filter Bar matching Screenshot 2 & 3 */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              {/* Left Filters: Range, Interval, API */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Date range filter */}
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none shadow-2xs"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>

                {/* Interval filter */}
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none shadow-2xs"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>

                {/* API Filter */}
                <div className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold shadow-2xs">
                  API: All
                </div>
              </div>

              {/* Right: View Toggle (Chart / Table) */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">View</span>
                <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setViewMode("chart")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "chart"
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "table"
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    Table
                  </button>
                </div>
              </div>
            </div>

            {/* Top Metric Cards matching Screenshot 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* API calls */}
              <div className="glass-card rounded-2xl p-5 space-y-1">
                <div className="text-xs font-semibold text-sky-500 dark:text-sky-400">API calls</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {usage?.api_calls ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2">
                  Total in selected period
                </div>
              </div>

              {/* Projected this month */}
              <div className="glass-card rounded-2xl p-5 space-y-1">
                <div className="text-xs font-semibold text-sky-500 dark:text-sky-400">
                  Projected this month
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {usage?.projected_this_month ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2">
                  Based on {days}-day average
                </div>
              </div>

              {/* Daily average */}
              <div className="glass-card rounded-2xl p-5 space-y-1">
                <div className="text-xs font-semibold text-sky-500 dark:text-sky-400">
                  Daily average
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {usage?.daily_average ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2">
                  Across {days} days
                </div>
              </div>
            </div>

            {/* Main Content: Table View vs Chart View */}
            {viewMode === "table" ? (
              <div className="glass-card rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">API calls</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Usage broken down by API · {days} days
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>

                {/* Grid Table matching Screenshot 2 */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4">API</th>
                        <th className="py-3 px-3 text-right">TOTAL</th>
                        <th className="py-3 px-3 text-right">%</th>
                        {usage?.date_columns?.map((col, idx) => (
                          <th key={idx} className="py-3 px-3 text-right">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium">
                      {usage?.services?.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-md bg-purple-500" />
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {s.service_name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-white">
                            {s.total}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-500 dark:text-slate-400">
                            {s.percentage}%
                          </td>
                          {s.days_values.map((v, vIdx) => (
                            <td
                              key={vIdx}
                              className={`py-3 px-3 text-right ${
                                v > 0 ? "font-bold text-sky-600 dark:text-sky-400" : "text-slate-400 dark:text-slate-500"
                              }`}
                            >
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}

                      {/* Total row with distinct styling */}
                      {usage?.total_row && (
                        <tr className="bg-slate-100/70 dark:bg-slate-900/90 font-bold border-t-2 border-slate-200 dark:border-white/10">
                          <td className="py-3 px-4 text-slate-900 dark:text-white">
                            {usage.total_row.service_name}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-900 dark:text-white">
                            {usage.total_row.total}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-700 dark:text-slate-300">
                            {usage.total_row.percentage}%
                          </td>
                          {usage.total_row.days_values.map((v, vIdx) => (
                            <td key={vIdx} className="py-3 px-3 text-right text-slate-900 dark:text-white">
                              {v}
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* User Breakdown Section */}
                <div className="pt-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Requests Completed by User
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-4">Employee</th>
                          <th className="py-2.5 px-4">Role</th>
                          <th className="py-2.5 px-4">API Service</th>
                          <th className="py-2.5 px-4 text-right">Requests</th>
                          <th className="py-2.5 px-4 text-right">Successful</th>
                          <th className="py-2.5 px-4 text-right">Failed</th>
                          <th className="py-2.5 px-4 text-right">Last Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium">
                        {usage?.user_breakdown && usage.user_breakdown.length > 0 ? (
                          usage.user_breakdown.map((ub, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                              <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">
                                {ub.employee_name} ({ub.employee_id})
                              </td>
                              <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                                {ub.role_name}
                              </td>
                              <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                                {ub.service_name}
                              </td>
                              <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                                {ub.requests}
                              </td>
                              <td className="py-2.5 px-4 text-right text-emerald-600 dark:text-emerald-400">
                                {ub.successful}
                              </td>
                              <td className="py-2.5 px-4 text-right text-rose-500">
                                {ub.failed}
                              </td>
                              <td className="py-2.5 px-4 text-right text-slate-400 text-[11px]">
                                {ub.last_active ? new Date(ub.last_active).toLocaleDateString() : "—"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-400">
                              No user request logs for this range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              /* Chart View matching Screenshot 3 */
              <div className="glass-card rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">API calls</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Usage broken down by 1 API · {days} days
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Chart Type Dropdown matching Screenshot 3 */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsChartTypeOpen(!isChartTypeOpen)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-2xs"
                      >
                        <LineChartIcon className="w-3.5 h-3.5 text-sky-500" />
                        <span>{chartType === "line" ? "Line chart" : "Stacked bar chart"}</span>
                      </button>

                      {isChartTypeOpen && (
                        <div className="absolute right-0 mt-1 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-lg py-1 z-20">
                          <button
                            type="button"
                            onClick={() => {
                              setChartType("line");
                              setIsChartTypeOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2 hover:bg-slate-50 dark:hover:bg-white/5 ${
                              chartType === "line" ? "font-bold text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <LineChartIcon className="w-4 h-4 mt-0.5 shrink-0" />
                            <div>
                              <div>Line chart</div>
                              <div className="text-[10px] text-slate-400 font-normal">Smooth trend per series</div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setChartType("bar");
                              setIsChartTypeOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2 hover:bg-slate-50 dark:hover:bg-white/5 ${
                              chartType === "bar" ? "font-bold text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <BarChart3 className="w-4 h-4 mt-0.5 shrink-0" />
                            <div>
                              <div>Stacked bar chart</div>
                              <div className="text-[10px] text-slate-400 font-normal">Contribution per series</div>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>

                {/* Render Selected Chart Type */}
                <div className="w-full h-72 pt-3">
                  {chartType === "line" ? (
                    <TimeseriesChart
                      data={usage?.timeseries || []}
                      series1Key="count"
                      series1Color="#8b5cf6"
                    />
                  ) : (
                    <StackedBarChart
                      data={usage?.timeseries || []}
                      series1Key="count"
                      series1Color="#8b5cf6"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

// ── Interactive SVG Line & Area Chart Component ─────────────────────────────

function TimeseriesChart({
  data,
  series1Key = "count",
  series1Color = "#3b82f6",
  series2Key,
}: {
  data: TimeseriesPoint[];
  series1Key?: string;
  series1Color?: string;
  series2Key?: string;
  series2Color?: string;
}) {
  if (!data || data.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No activity data to plot.</div>;
  }

  const maxVal = Math.max(
    5,
    ...data.map((d: any) => Math.max(Number(d[series1Key] || 0), Number((series2Key && d[series2Key]) || 0)))
  );

  const width = 800;
  const height = 240;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const getX = (idx: number) => padLeft + (idx / Math.max(1, data.length - 1)) * chartW;
  const getY = (val: number) => padTop + chartH - (val / maxVal) * chartH;

  // Build SVG path for series 1
  const points1 = data.map((d: any, i) => `${getX(i)},${getY(Number(d[series1Key] || 0))}`).join(" ");
  const area1 = `${getX(0)},${getY(0)} ${points1} ${getX(data.length - 1)},${getY(0)}`;

  // Y-axis tick values (4 steps)
  const yTicks = [0, Math.round(maxVal * 0.33), Math.round(maxVal * 0.66), maxVal];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none overflow-visible">
      <defs>
        <linearGradient id="gradient1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={series1Color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={series1Color} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Grid Lines & Y-axis labels */}
      {yTicks.map((tick, idx) => {
        const y = getY(tick);
        return (
          <g key={idx}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-white/5"
              strokeDasharray={tick === 0 ? "none" : "3 3"}
            />
            <text
              x={padLeft - 10}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <polygon points={area1} fill="url(#gradient1)" />

      {/* Line 1 */}
      <polyline
        fill="none"
        stroke={series1Color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points1}
      />

      {/* Interactive Dots & Tooltip Markers */}
      {data.map((d: any, idx) => {
        const val = Number(d[series1Key] || 0);
        const x = getX(idx);
        const y = getY(val);
        return (
          <g key={idx} className="group">
            <circle
              cx={x}
              cy={y}
              r={val > 0 ? "4" : "2"}
              fill={val > 0 ? series1Color : "currentColor"}
              className="text-slate-300 dark:text-slate-600 transition-transform group-hover:scale-150"
            />
            {/* Hover Tooltip */}
            <title>{`${d.label || d.date}: ${val} calls`}</title>
          </g>
        );
      })}

      {/* X-axis date labels */}
      {data.map((d, idx) => {
        // Render every Nth label to keep it neat
        const step = data.length > 15 ? Math.ceil(data.length / 7) : 1;
        if (idx % step !== 0 && idx !== data.length - 1) return null;
        return (
          <text
            key={idx}
            x={getX(idx)}
            y={height - 6}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-medium"
          >
            {d.label || d.date}
          </text>
        );
      })}
    </svg>
  );
}

// ── Interactive Stacked Bar Chart Component ─────────────────────────────────

function StackedBarChart({
  data,
  series1Key = "count",
  series1Color = "#8b5cf6",
}: {
  data: TimeseriesPoint[];
  series1Key?: string;
  series1Color?: string;
}) {
  if (!data || data.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No activity data to plot.</div>;
  }

  const maxVal = Math.max(5, ...data.map((d: any) => Number(d[series1Key] || 0)));

  const width = 800;
  const height = 240;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const barWidth = Math.max(8, Math.min(32, (chartW / data.length) * 0.6));

  const getX = (idx: number) => padLeft + (idx / Math.max(1, data.length - 1)) * (chartW - barWidth);
  const getY = (val: number) => padTop + chartH - (val / maxVal) * chartH;

  const yTicks = [0, Math.round(maxVal * 0.33), Math.round(maxVal * 0.66), maxVal];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none overflow-visible">
      {/* Grid Lines */}
      {yTicks.map((tick, idx) => {
        const y = getY(tick);
        return (
          <g key={idx}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-white/5"
              strokeDasharray={tick === 0 ? "none" : "3 3"}
            />
            <text
              x={padLeft - 10}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d: any, idx) => {
        const val = Number(d[series1Key] || 0);
        const x = getX(idx);
        const y = getY(val);
        const barH = (val / maxVal) * chartH;

        return (
          <g key={idx} className="group">
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(2, barH)}
              rx="4"
              fill={series1Color}
              className="transition-opacity group-hover:opacity-80"
            />
            <title>{`${d.label || d.date}: ${val} calls`}</title>
            <text
              x={x + barWidth / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[10px] font-medium"
            >
              {d.label || d.date}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
