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

export interface TimeseriesPoint {
  date: string;
  label: string;
  basic_plan_images?: number;
  plus_plan_images?: number;
  count?: number;
  total?: number;
}

export interface UserUsageItem {
  user_id: number;
  employee_name: string;
  employee_id: string;
  role_name: string;
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  success_rate: number;
  last_active: string | null;
  compliance_status: string;
}

export interface PlanDetails {
  name: string;
  quota: number;
  used: number;
  remaining: number;
  unit: string;
  subtitle: string;
  remaining_text: string;
}

export interface OverviewData {
  images_used: number;
  successful_calls?: number;
  failed_calls?: number;
  quota_limit: number;
  remaining_calls: number;
  projected_this_month: number | null;
  daily_average: number;
  timeseries: TimeseriesPoint[];
  user_usage: UserUsageItem[];
  is_sandbox_key?: boolean;
  detected_plan?: "free_trial" | "sandbox";
  active_plan?: "free_trial" | "sandbox";
  plans?: {
    free_trial: PlanDetails;
    sandbox: PlanDetails;
  };
}

export interface ServiceRow {
  service_name: string;
  total: number;
  percentage: number;
  days_values: number[];
}

export interface UserBreakdownRow {
  user_id: number;
  employee_name: string;
  employee_id: string;
  role_name: string;
  service_name: string;
  requests: number;
  successful: number;
  failed: number;
  last_active: string | null;
}

export interface UsageData {
  api_calls: number;
  projected_this_month: number;
  daily_average: number;
  date_columns: string[];
  date_keys: string[];
  services: ServiceRow[];
  total_row: ServiceRow;
  timeseries: TimeseriesPoint[];
  user_breakdown: UserBreakdownRow[];
}

export async function fetchApiOverview(plan?: string): Promise<OverviewData> {
  const query = plan ? `?plan=${encodeURIComponent(plan)}` : "";
  return request<OverviewData>(`/api/api-dashboard/overview${query}`);
}

export async function fetchApiUsage(params: {
  days?: number;
  interval?: string;
  user_id?: number;
  service_name?: string;
} = {}): Promise<UsageData> {
  const q = new URLSearchParams();
  if (params.days) q.append("days", String(params.days));
  if (params.interval) q.append("interval", params.interval);
  if (params.user_id) q.append("user_id", String(params.user_id));
  if (params.service_name) q.append("service_name", params.service_name);

  return request<UsageData>(`/api/api-dashboard/usage?${q.toString()}`);
}

export function getExportCsvUrl(days = 7, userId?: number, serviceName?: string): string {
  const q = new URLSearchParams({ days: String(days) });
  if (userId) q.append("user_id", String(userId));
  if (serviceName && serviceName !== "all") q.append("service_name", serviceName);
  return `/api/api-dashboard/export-csv?${q.toString()}`;
}
