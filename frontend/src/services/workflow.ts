import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

export interface WorkflowItem {
  id: number;
  name: string;
  is_active: boolean;
  created_at?: string;
  creator?: { employee_id: string; employee_name?: string | null };
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function extractDetail(err: unknown): string {
  if (err && typeof err === "object" && "detail" in err) {
    const d = (err as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0];
      if (first && typeof first === "object" && "msg" in first)
        return String((first as { msg: unknown }).msg);
    }
  }
  return "Something went wrong";
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Workflows ────────────────────────────────────────────────────────────

export async function fetchWorkflows(): Promise<WorkflowItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/`, { headers: authHeaders() });
  return handle(res);
}

export async function fetchWorkflow(id: number): Promise<WorkflowItem> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${id}`, { headers: authHeaders() });
  return handle(res);
}

export async function createWorkflow(name: string): Promise<WorkflowItem> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  return handle(res);
}

export async function updateWorkflow(
  id: number,
  payload: Partial<{ name: string; is_active: boolean }>
): Promise<WorkflowItem> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function deleteWorkflow(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}
