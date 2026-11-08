import { API_BASE_URL } from "@/lib/constants";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let errDetail = "Request failed";
    try {
      const data = await res.json();
      errDetail = data.detail || data.message || errDetail;
    } catch {}
    throw new Error(errDetail);
  }

  if (res.status === 204) return null as T;
  return res.json();
}

export interface GeminiOverviewSummary {
  total_requests: number;
  success_requests: number;
  cache_hits: number;
  fallback_requests: number;
  error_requests: number;
  cache_hit_rate: number;
  success_rate: number;
  avg_latency_ms: number;
}

export interface GeminiTokensBreakdown {
  prompt_tokens: number;
  candidates_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
  cached_tokens: number;
}

export interface GeminiExchangeRate {
  rate: number;
  from_currency: string;
  to_currency: string;
  last_updated: string;
  source: string;
  is_live: boolean;
}

export interface GeminiCostsSummary {
  total_cost_usd: number;
  total_cost_inr?: number;
  total_cost_saved_usd: number;
  total_cost_saved_inr?: number;
  net_roi_percent: number;
}

export interface GeminiPricingRates {
  input_per_million_usd: number;
  output_per_million_usd: number;
  input_per_million_inr?: number;
  output_per_million_inr?: number;
  exchange_rate?: number;
  image_tile_tokens: number;
  tile_dimensions: string;
}

export interface GeminiOverviewData {
  model_name: string;
  api_configured: boolean;
  days_window: number;
  window_label?: string;
  exchange_rate?: GeminiExchangeRate;
  pricing_rates: GeminiPricingRates;
  summary: GeminiOverviewSummary;
  tokens: GeminiTokensBreakdown;
  costs: GeminiCostsSummary;
  category_distribution: Record<string, number>;
}

export interface GeminiTimeseriesPoint {
  date: string;
  time_slot?: string;
  requests: number;
  prompt_tokens: number;
  candidates_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_inr?: number;
  cache_hits: number;
}

export interface GeminiTimeseriesResponse {
  days: number;
  mode?: "hourly" | "daily";
  exchange_rate?: number;
  points: GeminiTimeseriesPoint[];
}

export interface GeminiLogItem {
  id: number;
  request_id: string;
  timestamp: string;
  bbid: string | null;
  filename: string | null;
  model_name: string;
  status: "SUCCESS" | "CACHE_HIT" | "FALLBACK" | "ERROR" | string;
  status_code: number;
  prompt_tokens: number;
  candidates_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  estimated_cost_usd: number;
  estimated_cost_inr?: number;
  cost_saved_usd: number;
  cost_saved_inr?: number;
  exchange_rate?: number;
  latency_ms: number;
  primary_category: string | null;
  subcategory: string | null;
  product_type: string | null;
  classification_confidence: number | null;
  image_type: string | null;
  requires_manual_review: boolean;
  materials: Array<{ name: string; confidence?: number }>;
  components: string[];
  visual_properties: string[];
  error_message: string | null;
  detected_products?: Array<{
    product_type: string;
    quantity: number;
    components?: string[];
    materials?: string[];
    bounding_box?: number[];
  }>;
  is_multi_product_image?: boolean;
}

export interface GeminiLogsResponse {
  items: GeminiLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export async function fetchGeminiOverview(days = 30): Promise<GeminiOverviewData> {
  return request<GeminiOverviewData>(`/api/gemini-monitoring/overview?days=${days}`);
}

export async function fetchGeminiExchangeRate(refresh = false): Promise<GeminiExchangeRate> {
  const q = refresh ? "?refresh=true" : "";
  return request<GeminiExchangeRate>(`/api/gemini-monitoring/exchange-rate${q}`);
}

export async function fetchGeminiTimeseries(days = 7): Promise<GeminiTimeseriesResponse> {
  return request<GeminiTimeseriesResponse>(`/api/gemini-monitoring/timeseries?days=${days}`);
}

export async function fetchGeminiLogs(params: {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  category?: string;
  days?: number;
}): Promise<GeminiLogsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append("page", String(params.page));
  if (params.page_size) query.append("page_size", String(params.page_size));
  if (params.search) query.append("search", params.search);
  if (params.status && params.status !== "ALL") query.append("status", params.status);
  if (params.category && params.category !== "ALL") query.append("category", params.category);
  if (params.days) query.append("days", String(params.days));

  return request<GeminiLogsResponse>(`/api/gemini-monitoring/logs?${query.toString()}`);
}

export function getGeminiExportCsvUrl(params: {
  search?: string;
  status?: string;
  category?: string;
  days?: number;
}): string {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  if (params.status && params.status !== "ALL") query.append("status", params.status);
  if (params.category && params.category !== "ALL") query.append("category", params.category);
  if (params.days) query.append("days", String(params.days));

  return `${API_BASE_URL}/api/gemini-monitoring/export-csv?${query.toString()}`;
}

