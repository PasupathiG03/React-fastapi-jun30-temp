import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

export interface DocumentItem {
  id: number;
  filename: string;
  created_at: string;
  size: number;
  path: string;
  creator?: { employee_id: string; employee_name?: string | null } | null;
}

export async function fetchDocumentsApi(): Promise<DocumentItem[]> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/documents/`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail || "Failed to fetch documents";
    throw new Error(typeof detail === "string" ? detail : "Failed to fetch documents");
  }

  return res.json();
}

export async function uploadDocumentApi(file: File): Promise<DocumentItem> {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail || "Failed to upload document";
    throw new Error(typeof detail === "string" ? detail : "Failed to upload document");
  }

  return res.json();
}
