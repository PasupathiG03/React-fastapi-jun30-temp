import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

export interface AccessRole {
  id: number;
  name: string;
}

export interface AccessScreen {
  id: number;
  name: string;
  url: string;
}

export interface AccessGrant {
  role_id: number;
  menu_id: number;
}

export interface AccessMatrix {
  roles: AccessRole[];
  screens: AccessScreen[];
  grants: AccessGrant[];
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchAccessMatrix(processId?: number): Promise<AccessMatrix> {
  const qs = processId != null ? `?process_id=${processId}` : "";
  const res = await fetch(`${API_BASE_URL}/api/access/${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load screen access");
  return res.json();
}

export async function setAccess(roleId: number, menuId: number, allowed: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/access/`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ role_id: roleId, menu_id: menuId, allowed }),
  });
  if (!res.ok) throw new Error("Failed to update access");
}

// Workflow stages use the same matrix: `screens` are the stages, `menu_id` in a grant is the stage id.
export async function fetchStageAccessMatrix(workflowId: number): Promise<AccessMatrix> {
  const res = await fetch(`${API_BASE_URL}/api/access/workflow-stages?workflow_id=${workflowId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load stage access");
  return res.json();
}

export async function setStageAccess(roleId: number, stageId: number, allowed: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/access/workflow-stages`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ role_id: roleId, menu_id: stageId, allowed }),
  });
  if (!res.ok) throw new Error("Failed to update access");
}
