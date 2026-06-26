import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

export interface RoleItem {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at?: string;
  creator?: { employee_id: string; employee_name?: string | null };
}

export interface RoleCreatePayload {
  name: string;
  description?: string | null;
  is_active?: boolean;
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

export async function fetchRoles(): Promise<RoleItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/roles/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch roles");
  return res.json();
}

export async function createRole(payload: RoleCreatePayload): Promise<RoleItem> {
  const res = await fetch(`${API_BASE_URL}/api/roles/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
  return res.json();
}

export async function updateRole(
  id: number,
  payload: Partial<RoleCreatePayload>
): Promise<RoleItem> {
  const res = await fetch(`${API_BASE_URL}/api/roles/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
  return res.json();
}

export async function deleteRole(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/roles/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
}
