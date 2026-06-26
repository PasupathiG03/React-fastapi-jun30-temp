import { API_BASE_URL } from "@/lib/constants";

export interface LoginPayload {
  employee_id: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export async function loginApi(payload: LoginPayload): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(err));
  }

  return res.json();
}

/** FastAPI returns `detail` as a string (HTTPException) or an array of
 *  validation errors (422). Normalize both into a readable message. */
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "detail" in err) {
    const detail = (err as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
    if (first && typeof first === "object" && "msg" in first) {
        return String((first as { msg: unknown }).msg);
      }
    }
  }
  return "Invalid username or password";
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export async function changePasswordApi(payload: ChangePasswordPayload, token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(err));
  }
}
