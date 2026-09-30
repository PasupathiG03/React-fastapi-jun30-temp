import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

export type StageType = "production" | "qc" | "qa";

export interface StageItem {
  id: number;
  workflow_id: number;
  name: string;
  stage_type: StageType;
  sequence_order: number;
  role_ids: number[];
  created_at?: string;
  creator?: { employee_id: string; employee_name?: string | null };
}

export interface StageCreatePayload {
  name: string;
  stage_type: StageType;
  sequence_order: number;
  role_ids?: number[];
}

/** Workflow -> stages the current user's role may open (drives the sidebar). */
export interface MyWorkflow {
  id: number;
  name: string;
  stages: { id: number; name: string; stage_type: StageType; sequence_order: number }[];
}

/** One stage plus the context its workspace page shows. */
export interface StageAccess {
  id: number;
  name: string;
  stage_type: StageType;
  sequence_order: number;
  total_stages: number;
  is_first: boolean;
  is_last: boolean;
  workflow_id: number;
  workflow_name: string;
  role_names: string[];
}

export interface WorkflowItem {
  id: number;
  name: string;
  is_active: boolean;
  created_at?: string;
  creator?: { employee_id: string; employee_name?: string | null };
}

export interface WorkflowDetail extends WorkflowItem {
  stages: StageItem[];
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

export async function fetchWorkflows(): Promise<WorkflowDetail[]> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/`, { headers: authHeaders() });
  return handle(res);
}

export async function fetchWorkflow(id: number): Promise<WorkflowDetail> {
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

export async function fetchMyStages(): Promise<MyWorkflow[]> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/my-stages`, { headers: authHeaders() });
  return handle(res);
}

export async function fetchStage(workflowId: number, stageId: number): Promise<StageAccess> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}/stages/${stageId}`, {
    headers: authHeaders(),
  });
  return handle(res);
}

// ── Stages ───────────────────────────────────────────────────────────────

export async function createStage(
  workflowId: number,
  payload: StageCreatePayload
): Promise<StageItem> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}/stages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function updateStage(
  workflowId: number,
  stageId: number,
  payload: Partial<StageCreatePayload>
): Promise<StageItem> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}/stages/${stageId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function deleteStage(
  workflowId: number,
  stageId: number
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}/stages/${stageId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}

// ── Items moving through stages ──────────────────────────────────────────

export interface WorkItem {
  id: number;
  workflow_id: number;
  current_stage_id: number | null;
  title: string;
  description: string | null;
  is_completed: boolean;
  created_at?: string;
  updated_at?: string;
  creator?: { employee_id: string; employee_name?: string | null } | null;
}

export interface WorkItemHistory {
  id: number;
  action: "created" | "advanced" | "rejected" | "completed";
  from_stage_name: string | null;
  to_stage_name: string | null;
  comment: string | null;
  created_at?: string;
  actor?: { employee_id: string; employee_name?: string | null } | null;
}

export async function fetchStageItems(workflowId: number, stageId: number): Promise<WorkItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}/stages/${stageId}/items`, {
    headers: authHeaders(),
  });
  return handle(res);
}

export async function createWorkItem(
  workflowId: number,
  payload: { title: string; description?: string | null }
): Promise<WorkItem> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}/items`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function advanceWorkItem(itemId: number, comment?: string): Promise<WorkItem> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/items/${itemId}/advance`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ comment: comment || null }),
  });
  return handle(res);
}

export async function rejectWorkItem(itemId: number, comment: string): Promise<WorkItem> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/items/${itemId}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ comment }),
  });
  return handle(res);
}

export async function fetchWorkItemHistory(itemId: number): Promise<WorkItemHistory[]> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/items/${itemId}/history`, {
    headers: authHeaders(),
  });
  return handle(res);
}

// ── Pending counts (dashboard, bell, sidebar badges) ─────────────────────

export interface PendingStage {
  workflow_id: number;
  workflow_name: string;
  stage_id: number;
  stage_name: string;
  stage_type: StageType;
  sequence_order: number;
  count: number;
}

export async function fetchPendingByStage(): Promise<PendingStage[]> {
  const res = await fetch(`${API_BASE_URL}/api/workflows/pending`, { headers: authHeaders() });
  return handle(res);
}
