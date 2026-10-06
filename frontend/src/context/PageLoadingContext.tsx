import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Lets a part of the app shell (in practice, just the sidebar's own initial role/menu fetch) tell the
// rest of it that a first data request is still in flight, so chrome whose content depends on that data
// (the breadcrumb, the hamburger/theme/bell icons in TopBar) can show a skeleton instead of something
// blank or wrong during that one bootstrap window.
//
// Individual PAGES deliberately do NOT report into this: a page remounts fresh on every navigation, so
// doing that made the whole top bar flash back to skeleton on every single menu click, not just the
// app's initial load. Each page already shows its own in-page skeleton for its own data instead.
//
// Tracked as a set of named reporters, not one boolean, so adding a second legitimate reporter later
// (today there's only "sidebar") can't have one's "finished" overwrite the other's "still loading".
// pageLoading is true as long as ANY reporter is still loading.

interface PageLoadingContextValue {
  pageLoading: boolean;
  report: (id: string, loading: boolean) => void;
}

const PageLoadingContext = createContext<PageLoadingContextValue>({
  pageLoading: false,
  report: () => {},
});

export function PageLoadingProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Set<string>>(new Set());

  const report = useCallback((id: string, loading: boolean) => {
    setActive((prev) => {
      const isActive = prev.has(id);
      if (loading === isActive) return prev;
      const next = new Set(prev);
      if (loading) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return (
    <PageLoadingContext.Provider value={{ pageLoading: active.size > 0, report }}>
      {children}
    </PageLoadingContext.Provider>
  );
}

export function usePageLoading() {
  return useContext(PageLoadingContext);
}

/** Call with a stable id and the caller's own "first load" flag. Always clears on unmount, so leaving a
 * page mid-load (or the flag simply going true then false) never leaves that one reporter stuck active. */
export function useReportPageLoading(id: string, loading: boolean) {
  const { report } = usePageLoading();
  useEffect(() => {
    report(id, loading);
    return () => report(id, false);
  }, [id, loading, report]);
}
