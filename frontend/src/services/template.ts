import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

export async function uploadTemplateApi(file: File): Promise<{ message: string; filename: string; path: string }> {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/templates/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Do NOT set Content-Type to multipart/form-data, browser will set it with the correct boundary
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail || "Failed to upload template";
    throw new Error(typeof detail === "string" ? detail : "Failed to upload template");
  }

  return res.json();
}

export interface TemplateItem {
  id: number;
  filename: string;
  created_at: string;
  size: number;
  path: string;
  creator?: { employee_id: string; employee_name?: string | null } | null;
}

export async function fetchTemplatesApi(): Promise<TemplateItem[]> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/templates/`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail || "Failed to fetch templates";
    throw new Error(typeof detail === "string" ? detail : "Failed to fetch templates");
  }

  return res.json();
}

export async function deleteTemplateApi(id: number): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/templates/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to delete template");
  }
}

