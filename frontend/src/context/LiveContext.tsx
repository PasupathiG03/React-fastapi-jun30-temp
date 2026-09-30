import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";

interface LiveValue {
  /** Goes up whenever menus, permissions, workflows, roles or users changed on the server. */
  accessVersion: number;
  /** Goes up whenever work items moved between stages. */
  workVersion: number;
}

const LiveContext = createContext<LiveValue>({ accessVersion: 0, workVersion: 0 });

export const useLive = () => useContext(LiveContext);

/**
 * One Server-Sent-Events connection for the whole signed-in app. The server pushes a tiny message when
 * something changes, and pages refetch only then, so there is no polling and no manual refresh needed.
 */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [accessVersion, setAccessVersion] = useState(0);
  const [workVersion, setWorkVersion] = useState(0);
  const timers = useRef<{ access?: number; work?: number }>({});

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    // Bursts of changes (one save often touches several tables) are merged into one refresh.
    const bump = (kind: "access" | "work") => {
      window.clearTimeout(timers.current[kind]);
      timers.current[kind] = window.setTimeout(() => {
        (kind === "access" ? setAccessVersion : setWorkVersion)((v) => v + 1);
      }, 300);
    };

    const source = new EventSource(`${API_BASE_URL}/api/events?token=${encodeURIComponent(token)}`);
    let hadError = false;

    source.onmessage = (e) => {
      try {
        const kinds: string[] = JSON.parse(e.data).kinds ?? [];
        if (kinds.includes("access")) bump("access");
        if (kinds.includes("work")) bump("work");
      } catch {
        // ignore malformed messages
      }
    };
    source.onerror = () => {
      hadError = true; // the browser reconnects by itself
    };
    source.onopen = () => {
      if (hadError) {
        // We may have missed changes while disconnected: catch up once.
        hadError = false;
        bump("access");
        bump("work");
      }
    };

    // Safety net: when the user comes back to a tab that was hidden for a while, catch up once.
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
        bump("access");
        bump("work");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const pending = timers.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      source.close();
      window.clearTimeout(pending.access);
      window.clearTimeout(pending.work);
    };
  }, []);

  const value = useMemo(() => ({ accessVersion, workVersion }), [accessVersion, workVersion]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
