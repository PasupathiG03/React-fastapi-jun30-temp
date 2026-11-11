import { useEffect, useState } from "react";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Coins,
  Cpu,
  Database,
  Download,
  Eye,
  IndianRupee,
  Info,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import PageContainer from "@/components/PageContainer";
import { TablePagination } from "@/components/DataTableControls";
import Modal, { ModalBody, ModalFooter } from "@/components/Modal";
import {
  fetchGeminiOverview,
  fetchGeminiLogs,
  fetchGeminiExchangeRate,
  getGeminiExportCsvUrl,
  type GeminiOverviewData,
  type GeminiLogItem,
  type GeminiExchangeRate,
} from "@/services/geminiMonitoring";
import { showError, showSuccess } from "@/lib/toast";

export default function GeminiApiMonitoring() {
  const [days, setDays] = useState<number>(30); // 1 = All Day (Today), 7, 14, 30, 90, 0 = All Days
  const [currency, setCurrency] = useState<"BOTH" | "USD" | "INR">("BOTH");
  const [overview, setOverview] = useState<GeminiOverviewData | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(94.11);
  const [exchangeInfo, setExchangeInfo] = useState<GeminiExchangeRate | null>(null);
  const [refreshingFx, setRefreshingFx] = useState<boolean>(false);

  const [logs, setLogs] = useState<GeminiLogItem[]>([]);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Filters
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Loading states
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(true);

  // Inspector Modal
  const [inspectItem, setInspectItem] = useState<GeminiLogItem | null>(null);

  useEffect(() => {
    loadOverview();
  }, [days]);

  useEffect(() => {
    loadLogs();
  }, [days, page, pageSize, statusFilter, categoryFilter]);

  async function loadOverview() {
    setLoadingOverview(true);
    try {
      const data = await fetchGeminiOverview(days);
      setOverview(data);
      if (data?.exchange_rate?.rate) {
        setExchangeRate(data.exchange_rate.rate);
        setExchangeInfo(data.exchange_rate);
      }
    } catch (err: any) {
      showError(err.message || "Failed to load Gemini overview metrics");
    } finally {
      setLoadingOverview(false);
    }
  }

  async function loadLogs() {
    setLoadingLogs(true);
    try {
      const res = await fetchGeminiLogs({
        page,
        page_size: pageSize,
        search: search.trim() || undefined,
        status: statusFilter,
        category: categoryFilter,
        days,
      });
      setLogs(res.items);
      setTotalLogs(res.total);
      setTotalPages(res.total_pages);
    } catch (err: any) {
      showError(err.message || "Failed to load Gemini usage logs");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleRefreshFx() {
    setRefreshingFx(true);
    try {
      const fx = await fetchGeminiExchangeRate(true);
      setExchangeRate(fx.rate);
      setExchangeInfo(fx);
      showSuccess(`Live Forex updated: 1 USD = ₹${fx.rate.toFixed(2)} (${fx.source})`);
      loadOverview();
    } catch (err: any) {
      showError(err.message || "Failed to refresh live exchange rate");
    } finally {
      setRefreshingFx(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadLogs();
  }

  function handleRefreshAll() {
    loadOverview();
    loadLogs();
    showSuccess("Gemini API metrics refreshed");
  }

  // Format numbers nicely
  const fmt = (n?: number) => (n !== undefined ? n.toLocaleString() : "0");
  const fmtUsd = (n?: number) => (n !== undefined ? `$${n.toFixed(6)}` : "$0.000000");
  const fmtInr = (n?: number) => (n !== undefined ? `₹${n.toFixed(4)}` : "₹0.0000");

  const renderCostDisplay = (usdVal?: number, inrVal?: number) => {
    const u = usdVal ?? 0;
    const i = inrVal ?? u * exchangeRate;

    if (currency === "USD") {
      return <span>{fmtUsd(u)}</span>;
    }
    if (currency === "INR") {
      return <span className="text-amber-500 font-semibold">{fmtInr(i)}</span>;
    }
    return (
      <div className="flex flex-col items-end leading-tight">
        <span>{fmtUsd(u)}</span>
        <span className="text-[10px] text-amber-500/90 font-mono font-normal">
          {fmtInr(i)}
        </span>
      </div>
    );
  };

  return (
    <PageContainer>
      <div className="space-y-6 pb-12">
        {/* ── TOP HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Gemini API Monitoring
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                  {overview?.model_name || "gemini-3.5-flash-lite"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Multimodal token consumption, reasoning analysis, dual USD/INR official token pricing & SHA-256 caching efficiency.
              </p>
            </div>
          </div>

          {/* Header Quick Actions */}
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <a
              href={getGeminiExportCsvUrl({
                days,
                search: search.trim() || undefined,
                status: statusFilter,
                category: categoryFilter,
              })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all shadow-sm cursor-pointer"
              title="Export filtered logs to CSV with USD & INR costs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </a>

            <button
              type="button"
              onClick={handleRefreshAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all shadow-sm cursor-pointer"
              title="Refresh all metrics and logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview || loadingLogs ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* ── TOOLBAR: CURRENCY, REAL-TIME FOREX & TIME RANGE ── */}
        <div className="glass-card rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md shadow-sm">
          {/* Left: Currency Toggle + Live Real-time Forex Pill */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Currency Selector */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-slate-800/80 p-0.5 text-xs font-semibold">
              {(["BOTH", "USD", "INR"] as const).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setCurrency(curr)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    currency === curr
                      ? "bg-amber-500 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                  title={`Display costs in ${curr === "BOTH" ? "both USD & INR" : curr}`}
                >
                  {curr === "BOTH" ? "$ & ₹ (Both)" : curr === "USD" ? "$ USD" : "₹ INR"}
                </button>
              ))}
            </div>

            {/* Live Real-time USD/INR Forex Badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium shadow-2xs"
              title={`Live Forex Rate: 1 USD = ₹${exchangeRate.toFixed(2)} (${exchangeInfo?.source || "Real-time FX Feed"})\nClick refresh icon to re-fetch live rate.`}
            >
              <IndianRupee className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                Live <strong className="font-semibold text-emerald-800 dark:text-emerald-200 font-mono">1 USD = ₹{exchangeRate.toFixed(2)}</strong>
              </span>
              <button
                type="button"
                onClick={handleRefreshFx}
                disabled={refreshingFx}
                className="p-1 hover:bg-emerald-500/20 rounded-md transition-all cursor-pointer text-emerald-600 dark:text-emerald-400"
                title="Fetch latest real-time USD/INR rate"
              >
                <RefreshCw className={`w-3 h-3 ${refreshingFx ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Right: Time Range Window Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 hidden lg:inline">
              Time Range:
            </span>
            <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-slate-800/80 p-0.5 text-xs font-medium overflow-x-auto max-w-full">
              {[
                { label: "Today (24h)", val: 1, title: "Today: 24-Hour hourly breakdown" },
                { label: "7 Days", val: 7, title: "Last 7 Days" },
                { label: "14 Days", val: 14, title: "Last 14 Days" },
                { label: "30 Days", val: 30, title: "Last 30 Days" },
                { label: "90 Days", val: 90, title: "Last 90 Days" },
                { label: "All Time", val: 0, title: "All historical data" },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => {
                    setDays(opt.val);
                    setPage(1);
                  }}
                  title={opt.title}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                    days === opt.val
                      ? "bg-sky-500 text-white font-semibold shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 6 KEY METRIC CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* 1. Total Requests */}
          <div className="glass-card rounded-2xl p-4 space-y-2 border border-slate-200/80 dark:border-white/5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>Total Requests</span>
              <Activity className="w-4 h-4 text-sky-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {fmt(overview?.summary.total_requests)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{overview?.summary.success_rate || 100}% Success</span>
              {overview?.summary.error_requests ? (
                <span className="text-rose-500 ml-1">({overview.summary.error_requests} err)</span>
              ) : null}
            </div>
          </div>

          {/* 2. Input Tokens */}
          <div className="glass-card rounded-2xl p-4 space-y-2 border border-slate-200/80 dark:border-white/5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>Input Tokens (Prompt)</span>
              <Database className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {fmt(overview?.tokens.prompt_tokens)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Includes 258 tokens / image tile
            </div>
          </div>

          {/* 3. Output Tokens */}
          <div className="glass-card rounded-2xl p-4 space-y-2 border border-slate-200/80 dark:border-white/5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>Output Tokens (Candidates)</span>
              <Sparkles className="w-4 h-4 text-teal-500" />
            </div>
            <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
              {fmt(overview?.tokens.candidates_tokens)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Structured JSON output
            </div>
          </div>

          {/* 4. Thinking Tokens */}
          <div className="glass-card rounded-2xl p-4 space-y-2 border border-slate-200/80 dark:border-white/5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>Thinking Tokens</span>
              <BrainCircuit className="w-4 h-4 text-violet-500" />
            </div>
            <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              {fmt(overview?.tokens.thoughts_tokens)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              thoughtsTokenCount
            </div>
          </div>

          {/* 5. Estimated Cost (Dual USD & INR) */}
          <div className="glass-card rounded-2xl p-4 space-y-2 border border-slate-200/80 dark:border-white/5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>Estimated Cost ({currency === "USD" ? "$ USD" : currency === "INR" ? "₹ INR" : "$ & ₹"})</span>
              <Coins className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {currency === "USD" ? (
                fmtUsd(overview?.costs.total_cost_usd)
              ) : currency === "INR" ? (
                fmtInr(overview?.costs.total_cost_inr)
              ) : (
                <div className="space-y-0.5">
                  <div>{fmtUsd(overview?.costs.total_cost_usd)}</div>
                  <div className="text-xs font-semibold text-amber-500/90 font-mono">
                    ≈ {fmtInr(overview?.costs.total_cost_inr)}
                  </div>
                </div>
              )}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              @ ₹{exchangeRate.toFixed(2)} / USD
            </div>
          </div>

          {/* 6. Cache Hits & Savings (Dual USD & INR) */}
          <div className="glass-card rounded-2xl p-4 space-y-2 border border-slate-200/80 dark:border-white/5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>Cache Hits & Savings</span>
              <Zap className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {overview?.summary.cache_hit_rate || 0}%
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium font-mono">
              {currency === "INR" ? (
                `Saved ${fmtInr(overview?.costs.total_cost_saved_inr)}`
              ) : currency === "USD" ? (
                `Saved ${fmtUsd(overview?.costs.total_cost_saved_usd)}`
              ) : (
                <span>
                  Saved {fmtUsd(overview?.costs.total_cost_saved_usd)}
                  <span className="block text-[10px] opacity-80 font-normal">
                    ≈ {fmtInr(overview?.costs.total_cost_saved_inr)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── OFFICIAL GEMINI TOKEN & BILLING LOGIC REFERENCE CARD ── */}
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 dark:bg-sky-950/20 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-500" />
              Official Google Gemini Token Calculation & Pricing Logic (USD & INR)
            </h3>
            <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400">
              Live Exchange: 1 USD = ₹{exchangeRate.toFixed(2)} INR
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/60 dark:border-white/5 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                Input Image Tokenization
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Images up to 384×384 px count as flat <strong>258 tokens</strong>. Larger catalog images are tiled in 768×768 blocks at 258 tokens/tile.
              </p>
            </div>

            <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/60 dark:border-white/5 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                Thinking Tokens (Chain of Thought)
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Internal reasoning tokens tracked via <code>usageMetadata.thoughtsTokenCount</code>. Evaluates materials, reflection edges & handle integrity.
              </p>
            </div>

            <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/60 dark:border-white/5 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Official Rates (USD & INR)
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Input: <strong>$0.30 / 1M</strong> (≈ ₹{(0.30 * exchangeRate).toFixed(2)} / 1M)<br />
                Output & Thoughts: <strong>$2.50 / 1M</strong> (≈ ₹{(2.50 * exchangeRate).toFixed(2)} / 1M)
              </p>
            </div>

            <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/60 dark:border-white/5 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                SHA-256 Deduplication
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Bit-identical angles and repeat batch re-runs bypass API calls via image hash caching, saving <strong>100%</strong> of API billing and latency.
              </p>
            </div>
          </div>
        </div>

        {/* ── FILTER & SEARCH CONTROLS ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by SKU / BBID, filename, product type..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">Success Only</option>
              <option value="CACHE_HIT">Cache Hits (Saved)</option>
              <option value="FALLBACK">Fallback</option>
              <option value="ERROR">Errors</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="FOOD">Food Only</option>
              <option value="NON_FOOD">Non-Food Only</option>
              <option value="KITCHEN_ITEMS">Kitchen Items Only</option>
              <option value="UNKNOWN">Unknown / Review</option>
            </select>
          </div>
        </div>

        {/* ── AUDIT LOGS TABLE ── */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Gemini API Request Audit Log
              </h2>
              <p className="text-xs text-slate-500">
                {days === 1
                  ? "Showing all API requests for Today (24-Hour View)"
                  : days === 0
                  ? "Showing all API requests across All Time (Full History)"
                  : `Showing all API requests across last ${days} days`}
              </p>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Total Records: {totalLogs}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-white/10 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-3.5">Timestamp</th>
                  <th className="py-3 px-3.5">SKU / BBID</th>
                  <th className="py-3 px-3.5">Filename</th>
                  <th className="py-3 px-3.5">Category</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Prompt</th>
                  <th className="py-3 px-3.5 text-right">Output</th>
                  <th className="py-3 px-3.5 text-right">Thoughts</th>
                  <th className="py-3 px-3.5 text-right">Total</th>
                  <th className="py-3 px-3.5 text-right">
                    Cost ({currency === "USD" ? "$ USD" : currency === "INR" ? "₹ INR" : "$ & ₹"})
                  </th>
                  <th className="py-3 px-3.5 text-right">Latency</th>
                  <th className="py-3 px-3.5 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {loadingLogs ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-400 text-xs">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-500" />
                      Loading Gemini API logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-500">
                      No Gemini API logs found for selected criteria.
                    </td>
                  </tr>
                ) : (
                  logs.map((log, index) => (
                    <tr
                      key={log.id}
                      className="hover:bg-sky-500/5 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      {/* # */}
                      <td className="py-2.5 px-3 text-center text-xs font-mono font-medium text-slate-400 dark:text-slate-500">
                        {(page - 1) * pageSize + index + 1}
                      </td>

                      {/* Timestamp */}
                      <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono text-[11px]">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                      </td>

                      {/* SKU / BBID */}
                      <td className="py-2.5 px-3.5 font-bold font-mono text-slate-900 dark:text-white">
                        {log.bbid || "—"}
                      </td>

                      {/* Filename */}
                      <td className="py-2.5 px-3.5 max-w-[180px] truncate text-slate-700 dark:text-slate-300" title={log.filename || ""}>
                        {log.filename || "—"}
                      </td>

                      {/* Category Badge */}
                      <td className="py-2.5 px-3.5">
                        {(() => {
                          const cat = (log.primary_category || "UNKNOWN").toUpperCase();
                          if (cat === "KITCHEN_ITEMS") {
                            return (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                                Kitchen Items
                              </span>
                            );
                          }
                          if (cat === "NON_FOOD") {
                            return (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
                                Non-Food
                              </span>
                            );
                          }
                          if (cat === "FOOD") {
                            return (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                                Food
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/25">
                              {cat}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3.5">
                        {log.status === "SUCCESS" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                            SUCCESS
                          </span>
                        )}
                        {log.status === "CACHE_HIT" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/25">
                            CACHE HIT
                          </span>
                        )}
                        {log.status === "FALLBACK" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                            FALLBACK
                          </span>
                        )}
                        {log.status === "ERROR" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25">
                            ERROR
                          </span>
                        )}
                      </td>

                      {/* Prompt Tokens */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                        {fmt(log.prompt_tokens)}
                      </td>

                      {/* Candidates Tokens */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                        {fmt(log.candidates_tokens)}
                      </td>

                      {/* Thinking Tokens */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-medium text-violet-600 dark:text-violet-400">
                        {log.thoughts_tokens ? fmt(log.thoughts_tokens) : "—"}
                      </td>

                      {/* Total Tokens */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {fmt(log.total_tokens)}
                      </td>

                      {/* Cost (Dual USD & INR) */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                        {log.status === "CACHE_HIT" ? (
                          <span className="text-emerald-500" title={`Saved $${log.cost_saved_usd}`}>
                            $0.000000
                          </span>
                        ) : (
                          renderCostDisplay(log.estimated_cost_usd, log.estimated_cost_inr)
                        )}
                      </td>

                      {/* Latency */}
                      <td className="py-2.5 px-3.5 text-right font-mono text-slate-500 whitespace-nowrap">
                        {log.latency_ms > 0 ? `${log.latency_ms.toFixed(0)} ms` : "—"}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setInspectItem(log)}
                          className="p-1 rounded-lg text-slate-500 hover:text-sky-500 hover:bg-sky-500/10 transition-colors cursor-pointer"
                          title="View Token & Response Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Global Standard Reusable Pagination Controls */}
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            totalItems={totalLogs}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        </div>

        {/* ── INSPECTOR MODAL ── */}
        {inspectItem && (
          <Modal
            title="Gemini API Request Inspector"
            subtitle={inspectItem.request_id}
            icon={Cpu}
            size="xl"
            onClose={() => setInspectItem(null)}
          >
            <ModalBody className="space-y-4">
              {/* Key Attributes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-white/5">
                  <div className="text-slate-400">SKU / BBID</div>
                  <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                    {inspectItem.bbid || "—"}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-white/5">
                  <div className="text-slate-400">Model Name</div>
                  <div className="font-mono text-sky-500 mt-0.5 truncate" title={inspectItem.model_name}>
                    {inspectItem.model_name}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-white/5">
                  <div className="text-slate-400">Latency</div>
                  <div className="font-mono text-emerald-500 mt-0.5">
                    {inspectItem.latency_ms.toFixed(0)} ms
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-white/5">
                  <div className="text-slate-400">Total Billed</div>
                  <div className="font-mono font-semibold text-amber-500 mt-0.5">
                    {fmtUsd(inspectItem.estimated_cost_usd)}
                    <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                      ≈ {fmtInr(inspectItem.estimated_cost_inr || inspectItem.estimated_cost_usd * exchangeRate)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Token Breakdown Table */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden text-xs">
                <div className="bg-slate-50 dark:bg-slate-800/70 px-3 py-2 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <span>Official Token Breakdown (usageMetadata)</span>
                  <span className="text-[10px] font-normal text-slate-400">
                    Live Rate: 1 USD = ₹{exchangeRate.toFixed(2)}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  <div className="flex justify-between p-2.5">
                    <span className="text-slate-500 dark:text-slate-400">Prompt Tokens (Input + Image Tiles)</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{fmt(inspectItem.prompt_tokens)} tokens</span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="text-slate-500 dark:text-slate-400">Candidates Tokens (JSON Output)</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{fmt(inspectItem.candidates_tokens)} tokens</span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="text-slate-500 dark:text-slate-400">Thinking Tokens (thoughtsTokenCount)</span>
                    <span className="font-mono font-semibold text-violet-600 dark:text-violet-400">{fmt(inspectItem.thoughts_tokens)} tokens</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50/50 dark:bg-slate-800/30 font-bold">
                    <span className="text-slate-800 dark:text-slate-200">Total Billed Tokens</span>
                    <span className="font-mono text-sky-600 dark:text-sky-400">{fmt(inspectItem.total_tokens)} tokens</span>
                  </div>
                </div>
              </div>

              {/* Classification Results */}
              <div className="space-y-2 text-xs">
                <div className="font-bold text-slate-700 dark:text-slate-300">
                  Multimodal Classification Output
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/10 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200/90 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-[10px] font-bold border border-slate-300/60 dark:border-white/5">
                      Category: {inspectItem.primary_category || "—"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200/90 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-[10px] font-bold border border-slate-300/60 dark:border-white/5">
                      Subcategory: {inspectItem.subcategory || "—"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200/90 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-[10px] font-bold border border-slate-300/60 dark:border-white/5">
                      Type: {inspectItem.product_type || "—"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200/90 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-[10px] font-bold border border-slate-300/60 dark:border-white/5">
                      Image Role: {inspectItem.image_type || "—"}
                    </span>
                  </div>

                  {inspectItem.materials && inspectItem.materials.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      <span className="text-slate-400 text-[11px] mr-1">Materials:</span>
                      {inspectItem.materials.map((m, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold border border-indigo-500/20">
                          {m.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {inspectItem.components && inspectItem.components.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-slate-400 text-[11px] mr-1">Components:</span>
                      {inspectItem.components.map((c, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[10px] font-semibold border border-teal-500/20">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {inspectItem.detected_products && inspectItem.detected_products.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-1.5">
                      <div className="font-semibold text-amber-600 dark:text-amber-400 text-[11px] flex items-center justify-between">
                        <span>Multi-Product Kit ({inspectItem.detected_products.length} Detected Items):</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">
                          Cookware Set
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {inspectItem.detected_products.map((dp: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-white/5 space-y-0.5">
                            <div className="flex justify-between font-bold text-[11px] text-slate-800 dark:text-slate-200">
                              <span>{dp.product_type?.replace(/_/g, " ")}</span>
                              <span className="text-amber-500 font-mono">Qty: {dp.quantity || 1}</span>
                            </div>
                            {dp.components && dp.components.length > 0 && (
                              <div className="text-[10px] text-slate-500">
                                <strong>Parts:</strong> {dp.components.join(", ")}
                              </div>
                            )}
                            {dp.materials && dp.materials.length > 0 && (
                              <div className="text-[10px] text-slate-500">
                                <strong>Materials:</strong> {dp.materials.join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {inspectItem.error_message && (
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] border border-rose-500/20">
                      <strong>Error:</strong> {inspectItem.error_message}
                    </div>
                  )}
                </div>
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer"
              >
                Close
              </button>
            </ModalFooter>
          </Modal>
        )}
      </div>
    </PageContainer>
  );
}
