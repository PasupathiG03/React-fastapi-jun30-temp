import { API_BASE_URL } from "@/lib/constants";

// The real session is an HttpOnly cookie set by the server; page scripts cannot read it (so an XSS bug
// cannot steal it). The values below only let the UI know WHEN the session ends, so it can sign the user
// out on screen. They carry no secret: the server enforces the same limits on every request.
const SESSION_FLAG = "session_active";
const IDLE_MS_KEY = "session_idle_ms";
const DEADLINE_KEY = "session_deadline"; // absolute end of this sign-in (epoch ms)
const ACTIVITY_KEY = "session_last_activity"; // shared between tabs so activity in one keeps all alive
const REASON_KEY = "logout_reason";

export type LogoutReason = "expired" | "idle";

export function markSignedIn(idleMinutes: number, maxMinutes: number): void {
  localStorage.setItem(SESSION_FLAG, "1");
  localStorage.setItem(IDLE_MS_KEY, String(idleMinutes * 60_000));
  localStorage.setItem(DEADLINE_KEY, String(Date.now() + maxMinutes * 60_000));
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
}

export function isAuthenticated(): boolean {
  if (localStorage.getItem(SESSION_FLAG) !== "1") return false;
  const deadline = Number(localStorage.getItem(DEADLINE_KEY));
  if (deadline && Date.now() > deadline) {
    clearSession();
    return false;
  }
  return true;
}

export function getSessionLimits(): { idleMs: number; deadline: number } {
  return {
    idleMs: Number(localStorage.getItem(IDLE_MS_KEY)) || 30 * 60_000,
    deadline: Number(localStorage.getItem(DEADLINE_KEY)) || Number.MAX_SAFE_INTEGER,
  };
}

export function recordActivity(at = Date.now()): void {
  localStorage.setItem(ACTIVITY_KEY, String(at));
}

export function lastActivity(): number {
  return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
}

/** Remember why the user was signed out, so the login page can explain it once. */
export function setLogoutReason(reason: LogoutReason): void {
  sessionStorage.setItem(REASON_KEY, reason);
}

export function takeLogoutReason(): LogoutReason | null {
  const reason = sessionStorage.getItem(REASON_KEY) as LogoutReason | null;
  sessionStorage.removeItem(REASON_KEY);
  return reason;
}

/** Forget the local sign-in state (the server-side session is ended by logout()). */
export function clearSession(): void {
  [SESSION_FLAG, IDLE_MS_KEY, DEADLINE_KEY, ACTIVITY_KEY].forEach((k) => localStorage.removeItem(k));
  // Forget per-session UI state (open sidebar groups, cached menu size) so the next
  // login starts from a clean sidebar instead of the previous session's layout.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sidebar:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable
  }
}

/** Sign out: the server ends the session and removes the cookie, then the local state is cleared. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST" });
  } catch {
    // offline: the local state is still cleared below
  } finally {
    clearSession();
  }
}
