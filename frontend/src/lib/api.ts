import { API_BASE_URL } from "@/lib/constants";
import { clearSession, setLogoutReason } from "@/lib/auth";

let installed = false;

/**
 * Wraps window.fetch once, for requests to our own API only:
 *  - sends the HttpOnly session cookie along (credentials: "include"), and
 *  - when the server says the session is over (401), clears the local sign-in state and returns to /login.
 * Requests to any other address are left untouched.
 */
export function installApiFetch(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API_BASE_URL)) return nativeFetch(input, init);

    const response = await nativeFetch(input, { ...init, credentials: "include" });
    const isAuthCall = url.includes("/api/auth/login") || url.includes("/api/auth/logout");
    if (response.status === 401 && !isAuthCall && window.location.pathname !== "/login") {
      setLogoutReason("expired");
      clearSession();
      window.location.assign("/login");
    }
    return response;
  };
}
