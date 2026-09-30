import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";
import {
  getSessionLimits,
  isAuthenticated,
  lastActivity,
  logout,
  recordActivity,
  setLogoutReason,
  type LogoutReason,
} from "@/lib/auth";

const WARN_MS = 60_000; // warn this long before the session ends
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"] as const;

/**
 * Signs the user out on screen exactly when the session ends:
 *  - after the idle time with no clicks/typing/scrolling (in any open tab), or
 *  - at the absolute limit of one sign-in.
 * While the user is active it quietly asks the server to renew the idle window, and one minute before
 * the end it offers "Stay signed in". The server enforces the same limits, so this is about a clear,
 * timely message, not the only line of defence.
 */
export default function SessionWatcher() {
  const navigate = useNavigate();
  const lastPing = useRef(Date.now());
  const lastWrite = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [canExtend, setCanExtend] = useState(true);

  const endSession = useCallback(
    async (reason: LogoutReason) => {
      setLogoutReason(reason);
      await logout();
      navigate("/login", { replace: true });
    },
    [navigate]
  );

  const ping = useCallback(() => {
    lastPing.current = Date.now();
    // Any authenticated call renews the server-side idle window; a 401 is handled by lib/api.ts.
    fetch(`${API_BASE_URL}/api/auth/me`).catch(() => { });
  }, []);

  useEffect(() => {
    // A session started before activity was tracked has no timestamp yet: begin counting from now.
    if (!lastActivity()) recordActivity();

    const markActive = () => {
      const now = Date.now();
      if (now - lastWrite.current > 5_000) {
        lastWrite.current = now;
        recordActivity(now);
      }
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));

    // Another tab signed out (or the session was cleared): follow it.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "session_active" && e.newValue === null) navigate("/login", { replace: true });
    };
    window.addEventListener("storage", onStorage);

    const timer = window.setInterval(() => {
      if (!isAuthenticated()) {
        navigate("/login", { replace: true });
        return;
      }
      const { idleMs, deadline } = getSessionLimits();
      const now = Date.now();
      const idleLeft = idleMs - (now - lastActivity());
      const absoluteLeft = deadline - now;

      if (absoluteLeft <= 0) return void endSession("expired");
      if (idleLeft <= 0) return void endSession("idle");

      const left = Math.min(idleLeft, absoluteLeft);
      if (left <= WARN_MS) {
        setCanExtend(idleLeft <= absoluteLeft); // only the idle window can be renewed
        setSecondsLeft(Math.ceil(left / 1000));
      } else {
        setSecondsLeft(null);
        // Working normally: renew the server session every third of the idle window.
        if (now - lastPing.current > idleMs / 3) ping();
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [endSession, navigate, ping]);

  if (secondsLeft === null) return null;

  const stay = () => {
    recordActivity();
    ping();
    setSecondsLeft(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="session-title">
      <div className="w-full max-w-sm rounded-2xl glass-modal p-6 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <Clock className="w-6 h-6" />
        </div>
        <h3 id="session-title" className="text-base font-bold text-slate-900 dark:text-white">Your session is about to end</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          {canExtend ? "You have been inactive. You will be signed out in" : "This sign-in reaches its time limit. You will be signed out in"}
        </p>
        <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white my-3">{secondsLeft}s</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => endSession(canExtend ? "idle" : "expired")}
            className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 glass-btn border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
          >
            Sign out now
          </button>
          {canExtend && (
            <button
              type="button"
              onClick={stay}
              className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#00c6ff] to-[#0072ff] shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              Stay signed in
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
