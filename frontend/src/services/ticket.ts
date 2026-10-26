import { API_BASE_URL } from "@/lib/constants";

export type TicketType = "bug" | "requirement";
export type TicketPriority = "low" | "medium" | "high";
// "new": raised, no Developer has opened it yet. It becomes "open" when a Developer first opens it.
export type TicketStatus = "new" | "open" | "in_progress" | "resolved";

interface Creator {
  employee_id: string;
  employee_name?: string | null;
}

export interface TicketItem {
  id: number;
  type: TicketType;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  reply_count: number;
  // The person who raised it can edit/delete it until a Developer starts working on it.
  can_edit?: boolean;
  created_at: string;
  updated_at: string;
  creator?: Creator | null;
}

export interface TicketReply {
  id: number;
  message: string;
  created_at: string;
  creator?: Creator | null;
}

export interface TicketDetail extends TicketItem {
  replies: TicketReply[];
}

export interface TicketCreatePayload {
  type: TicketType;
  subject: string;
  description: string;
  priority: TicketPriority;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/tickets${path}`, { headers: authHeaders(), ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
  return res.json();
}

/** can_manage: only full access (superuser + Developer role) resolves tickets (see all, change status, reply). */
export const fetchTicketPermissions = () => request<{ can_manage: boolean }>("/permissions");

export const fetchTickets = () => request<TicketItem[]>("/");

export const fetchTicket = (id: number) => request<TicketDetail>(`/${id}`);

export const createTicket = (payload: TicketCreatePayload) =>
  request<TicketDetail>("/", { method: "POST", body: JSON.stringify(payload) });

export const editTicket = (id: number, payload: TicketCreatePayload) =>
  request<TicketDetail>(`/${id}/edit`, { method: "PUT", body: JSON.stringify(payload) });

export async function deleteTicket(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/tickets/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractDetail(err));
  }
}

export const updateTicket =(id: number, payload: { status: TicketStatus }) =>
  request<TicketDetail>(`/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const addTicketReply = (id: number, message: string) =>
  request<TicketReply>(`/${id}/replies`, { method: "POST", body: JSON.stringify({ message }) });
