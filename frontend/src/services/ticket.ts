import { API_BASE_URL } from "@/lib/constants";

export type TicketType = "bug" | "requirement";
export type TicketPriority = "low" | "medium" | "high";
export type TicketStatus = "open" | "in_progress" | "resolved";

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

export const fetchTickets = () => request<TicketItem[]>("/");

export const fetchTicket = (id: number) => request<TicketDetail>(`/${id}`);

export const createTicket = (payload: TicketCreatePayload) =>
  request<TicketDetail>("/", { method: "POST", body: JSON.stringify(payload) });

export const updateTicket = (id: number, payload: { status?: TicketStatus; priority?: TicketPriority }) =>
  request<TicketDetail>(`/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const addTicketReply = (id: number, message: string) =>
  request<TicketReply>(`/${id}/replies`, { method: "POST", body: JSON.stringify({ message }) });
