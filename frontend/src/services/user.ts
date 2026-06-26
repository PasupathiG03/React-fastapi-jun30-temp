import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

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
