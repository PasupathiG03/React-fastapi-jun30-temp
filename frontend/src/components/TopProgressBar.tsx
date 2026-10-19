import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { beginNavigation, isProgressActive, routeCommitted, subscribeProgress } from "@/lib/topProgress";

// Waits this long before showing anything, so a page that is already cached and loads instantly
// never flashes the bar on and off.
const SHOW_DELAY_MS = 80;

/** Thin YouTube-style loading bar pinned to the top of the window, shown while a menu/page is loading. */
export default function TopProgressBar() {
  const location = useLocation();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const shown = useRef(false);
  const timers = useRef<{ show?: number; trickle?: number; hide?: number; reset?: number }>({});

  // Start the bar on the click itself -- React Router swaps routes in a transition, so without this
  // nothing would move until the next page's code had already downloaded.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      beginNavigation();
    }
    function onPopState() {
      beginNavigation();
    }
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    routeCommitted();
  }, [location.pathname]);

  useEffect(() => {
    const t = timers.current;
    const clearAll = () => {
      window.clearTimeout(t.show);
      window.clearInterval(t.trickle);
      window.clearTimeout(t.hide);
      window.clearTimeout(t.reset);
    };

    function start() {
      clearAll();
      t.show = window.setTimeout(() => {
        shown.current = true;
        setWidth(0);
        setVisible(true);
        // Next frame so the jump from 0 animates instead of snapping.
        requestAnimationFrame(() => setWidth(15));
        // Ease towards 90% -- big steps first, then slower, like YouTube -- never reaching the end
        // until the load really finishes.
        t.trickle = window.setInterval(() => {
          setWidth((w) => (w >= 90 ? w : w + Math.max(0.5, (90 - w) * 0.1)));
        }, 200);
      }, SHOW_DELAY_MS);
    }

    function stop() {
      window.clearTimeout(t.show);
      window.clearInterval(t.trickle);
      // Never shown (finished inside SHOW_DELAY_MS) -> nothing to animate out.
      if (!shown.current) return;
      setWidth(100);
      t.hide = window.setTimeout(() => {
        shown.current = false;
        setVisible(false);
      }, 250);
      t.reset = window.setTimeout(() => setWidth(0), 600);
    }

    if (isProgressActive()) start();
    const unsubscribe = subscribeProgress((active) => (active ? start() : stop()));
    return () => {
      unsubscribe();
      clearAll();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]">
      <div
        className="top-progress-bar h-full bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500"
        style={{
          width: `${width}%`,
          opacity: visible ? 1 : 0,
          transition: `width ${width === 0 ? 0 : 200}ms ease-out, opacity 300ms ease ${visible ? "0ms" : "100ms"}`,
        }}
      />
    </div>
  );
}
