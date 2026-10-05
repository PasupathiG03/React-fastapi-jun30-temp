import { API_BASE_URL } from "@/lib/constants";
import type { ProcessItem } from "@/services/process";

export interface MenuItem {
  id: number;
  name: string;
  icon: string | null;
  url: string;
  order: number;
  process_id: number | null;
  process?: ProcessItem | null;
  is_active: boolean;
  created_at?: string;
  creator?: { employee_id: string; employee_name?: string | null };
}

export interface MenuCreatePayload {
  name: string;
  icon?: string | null;
  url: string;
  order?: number;
  process_id: number;
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

export async function fetchMenus(): Promise<MenuItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/menus/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch menus");
  return res.json();
}

export async function fetchAllMenus(processId?: number): Promise<MenuItem[]> {
  const qs = processId != null ? `?process_id=${processId}` : "";
  const res = await fetch(`${API_BASE_URL}/api/menus/all${qs}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch menus");
  return res.json();
}

export async function createMenu(payload: MenuCreatePayload): Promise<MenuItem> {
  const res = await fetch(`${API_BASE_URL}/api/menus/`, {
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

export async function updateMenu(
  id: number,
  payload: Partial<MenuCreatePayload & { is_active: boolean }>
): Promise<MenuItem> {
  const res = await fetch(`${API_BASE_URL}/api/menus/${id}`, {
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

export async function deleteMenu(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/menus/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
}

export interface MenuReorderPayload {
  id: number;
  order: number;
}

export async function updateMenuOrders(payload: MenuReorderPayload[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/menus/reorder`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
}
