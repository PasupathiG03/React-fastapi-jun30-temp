const TOKEN_KEY = "access_token";

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}
