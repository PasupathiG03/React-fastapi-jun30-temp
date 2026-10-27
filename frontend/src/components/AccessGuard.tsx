import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { API_BASE_URL } from "@/lib/constants";
import { hasFullAccess } from "@/lib/access";
import { DASHBOARD_PATHS } from "@/lib/lazyPages";
import { clearSession, logout, setLogoutReason, type LogoutReason } from "@/lib/auth";
import { showError } from "@/lib/toast";
import { useLive } from "@/context/LiveContext";
import { fetchMenus } from "@/services/menu";

// Applies the full-access rule to what the browser lets a user do (the backend already refuses the data):
//
//  - Full access (superuser AND Developer role): every screen, any number of tabs and browsers, URLs may be
//    typed freely.
//  - Everyone else is signed out automatically (on the server too, so every tab ends) when they:
//      * type or edit the URL in the address bar,
//      * open the app in a second tab, or
//      * sign in on a second browser (enforced by the backend: the newer sign-in ends the older session).
//    In-app navigation through the menu only ever reaches granted screens; any other address that still
//    renders (e.g. a stale link) is sent back to the dashboard gate with a message.

type Decision = { kind: "loading" } | { kind: "full" } | { kind: "limited"; allowed: string[] };

// Always reachable: the dashboard gate sends a limited user on to their first granted screen, and
// workflow stage addresses are opened from the user's own sidebar list (the stage API checks the role).
const ALWAYS_ALLOWED = DASHBOARD_PATHS;
const ALWAYS_ALLOWED_PREFIXES = ["/workflows/"];

function isAllowed(pathname: string, allowed: string[]): boolean {
  if (ALWAYS_ALLOWED.includes(pathname) || ALWAYS_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return allowed.some((url) => pathname === url || pathname.startsWith(url + "/"));
}

// Moving around inside the app never reloads the page (React Router uses the History API). So a fresh page
// load ("navigate"; Refresh and Back/Forward are other load types) in a tab where the app was ALREADY open
// means the address bar was typed/edited. "Already open in this tab" is remembered in sessionStorage (it is
// per tab and survives page loads); the tab's history length is a second signal.
//
// Edge/Chrome may PRERENDER the page while the user is still typing in the address bar; a prerendered page
// starts with its own fresh history and storage, so the check waits until the page is actually shown.
//
// A load that STARTS on /login never counts: the user then signs in and moves on in-app, and that page is
// also where every sign-out lands (via location.replace), which would otherwise look like a typed URL.
const TAB_SEEN_KEY = "app_open_in_this_tab";

function detectManualUrlLoad(): boolean {
  if (window.location.pathname === "/login") return false;
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if ((entry?.type ?? "navigate") !== "navigate") return false;
  let seenInThisTab = false;
  try {
    seenInThisTab = sessionStorage.getItem(TAB_SEEN_KEY) === "1";
  } catch {
    // storage unavailable: fall back to the history signal alone
  }
  return seenInThisTab || window.history.length > 1;
}

function markAppOpenInThisTab() {
  try {
    sessionStorage.setItem(TAB_SEEN_KEY, "1");
  } catch {
    // storage unavailable
  }
}

/** Resolves once the page is really shown (immediately unless it is being prerendered). */
function whenShown(): Promise<void> {
  const doc = document as Document & { prerendering?: boolean };
  if (!doc.prerendering) return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("prerenderingchange", () => resolve(), { once: true }));
}

// Decided once per page load, after the page is shown; later in-app navigation never counts.
const manualUrlLoadCheck: Promise<boolean> = whenShown().then(detectManualUrlLoad);

const TAB_CHANNEL = "pulse-tabs";
const TAB_ID = Math.random().toString(36).slice(2); // one per page load, i.e. per tab

/** End the session everywhere (server + every open tab of this browser), then go to the sign-in page. */
async function signOutEverywhere(reason: LogoutReason) {
  setLogoutReason(reason);
  try {
    const ch = new BroadcastChannel(TAB_CHANNEL);
    ch.postMessage({ type: "signed-out", reason });
    ch.close();
  } catch {
    // no BroadcastChannel: the other tabs still find out on their next request (401)
  }
  await logout();
  window.location.replace("/login");
}

export default function AccessGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { accessVersion } = useLive();
  const [decision, setDecision] = useState<Decision>({ kind: "loading" });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${API_BASE_URL}/api/auth/me`).then((r) => (r.ok ? r.json() : null)),
      fetchMenus().catch(() => []),
    ]).then(([me, menus]) => {
      if (cancelled) return;
      if (hasFullAccess(me)) setDecision({ kind: "full" });
      else setDecision({ kind: "limited", allowed: menus.map((m) => m.url).filter(Boolean) });
    });
    return () => {
      cancelled = true;
    };
  }, [accessVersion]);

  const limited = decision.kind === "limited";

  // Rule 1: a limited user who typed/edited the URL is signed out.
  useEffect(() => {
    if (decision.kind === "loading") return;
    let cancelled = false;
    void manualUrlLoadCheck.then((wasManual) => {
      if (cancelled) return;
      markAppOpenInThisTab(); // from now on, a fresh load in this tab means the URL was edited
      if (limited && wasManual) {
        setSigningOut(true);
        void signOutEverywhere("url");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [decision.kind, limited]);

  // Rule 2: a limited user may have the app open in one tab only.
  useOneTabOnly(limited && !signingOut, () => {
    setSigningOut(true);
    void signOutEverywhere("tabs");
  });

  const blocked = limited && !isAllowed(pathname, decision.allowed);
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (blocked && !signingOut && warned.current !== pathname) {
      warned.current = pathname;
      showError("You don't have access to that screen. Please use the menu.");
    }
  }, [blocked, signingOut, pathname]);

  // Render nothing until the role is known (first load only) or while signing out: a forbidden page is
  // never shown, not even for a moment.
  if (decision.kind === "loading" || signingOut) return null;
  if (blocked) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * When enabled, a newly opened tab asks whether the app is already open in another tab of this browser;
 * if one answers, onSecondTab() runs (it signs out everywhere). Every tab also obeys a "signed-out" message.
 */
function useOneTabOnly(enabled: boolean, onSecondTab: () => void) {
  const onSecondTabRef = useRef(onSecondTab);
  useEffect(() => {
    onSecondTabRef.current = onSecondTab;
  });

  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(TAB_CHANNEL);
    let decided = false;
    ch.onmessage = (e) => {
      const msg = e.data ?? {};
      if (msg.tabId === TAB_ID) return;
      if (msg.type === "hello") ch.postMessage({ type: "here", tabId: TAB_ID }); // an older tab answers the new one
      if (msg.type === "here" && !decided) {
        decided = true;
        onSecondTabRef.current();
      }
      if (msg.type === "signed-out") {
        setLogoutReason(msg.reason);
        clearSession();
        window.location.replace("/login");
      }
    };
    ch.postMessage({ type: "hello", tabId: TAB_ID });
    const settle = window.setTimeout(() => (decided = true), 1500); // no answer: this is the only tab
    return () => {
      window.clearTimeout(settle);
      ch.close();
    };
  }, [enabled]);
}
