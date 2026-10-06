import { API_BASE_URL } from "@/lib/constants";

export interface UserItem {
  id: number;
  employee_id: string;
  employee_name: string | null;
  location: string | null;
  is_active: boolean;
  is_superuser: boolean;
  role_id: number | null;
  role: { id: number; name: string } | null;
  created_at?: string;
  creator?: { employee_id: string; employee_name?: string | null };
}

export interface UserCreatePayload {
  employee_id: string;
  employee_name?: string | null;
  location?: string | null;
  is_active?: boolean;
  is_superuser?: boolean;
  role_id?: number | null;
}

export interface BulkUserInput {
  employee_id: string;
  employee_name?: string | null;
  location?: string | null;
  role_name?: string | null;
}

export interface BulkImportRowResult {
  row: number;
  employee_id: string;
  status: "created" | "reactivated" | "error";
  message?: string | null;
}

export interface BulkImportResult {
  created: number;
  reactivated: number;
  failed: number;
  rows: BulkImportRowResult[];
}

function authHeaders(): Record<string, string> {
  // The session travels in an HttpOnly cookie (see lib/api.ts); no token is handled here.
  return { "Content-Type": "application/json" };
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

export async function fetchUsers(): Promise<UserItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/users/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function createUser(payload: UserCreatePayload): Promise<UserItem> {
  const res = await fetch(`${API_BASE_URL}/api/users/`, {
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

export async function updateUser(
  id: number,
  payload: Partial<UserCreatePayload>
): Promise<UserItem> {
  const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
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

export async function bulkImportUsers(rows: BulkUserInput[]): Promise<BulkImportResult> {
  const res = await fetch(`${API_BASE_URL}/api/users/bulk-import`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
  return res.json();
}

export async function deleteUser(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
}
