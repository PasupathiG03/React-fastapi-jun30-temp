import {
  createElement,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { getPageForPath } from "@/lib/lazyPages";

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Global lazy-loading helpers -- usable from ANY page or component.
//
//   Whole screens (menus) are registered in PAGE_ROUTES (src/lib/lazyPages.ts). Use these helpers for
//   anything heavy INSIDE a page: a big modal, a chart, an editor, a tab, or another page reused as a block.
//
//   // default export
//   const BulkImportModal = lazyLoad(() => import("@/components/BulkImportModal"), { fallback: null });
//   // named export
//   const RoleTable = lazyLoad(() => import("@/components/RoleTable"), { export: "RoleTable" });
//
//   // reuse a whole page/menu inside another page, by its menu URL (same chunk as its route)
//   <LazyPage path="/access-control/role-management" />
//
//   <BulkImportModal open={open} />          -- code downloads the first time it renders
//   onMouseEnter={BulkImportModal.preload}   -- or earlier, on hover / intent
//   <LazyOnView><HeavyChart /></LazyOnView>  -- render only once scrolled near the viewport
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Default placeholder while a lazy block's code downloads: a soft skeleton, never a blank jump. */
export function LazyFallback({ minHeight = 96 }: { minHeight?: number }) {
  return (
    <div
      aria-busy="true"
      className="w-full rounded-2xl bg-slate-200/60 dark:bg-white/[0.06] animate-pulse"
      style={{ minHeight }}
    />
  );
}

type AnyComponent = ComponentType<any>;

export type LazyLoaded<C extends AnyComponent> = ComponentType<ComponentProps<C>> & {
  /** Start downloading the code now (hover, idle, before opening a modal...). Safe to call repeatedly. */
  preload: () => Promise<unknown>;
};

export interface LazyLoadOptions<K> {
  /** Named export to use instead of `default`. */
  export?: K;
  /** Shown while the code downloads. Defaults to <LazyFallback />; pass `null` for modals/popovers. */
  fallback?: ReactNode;
}

/**
 * Lazy-load any component (default or named export) with its own Suspense boundary built in, so it can
 * be dropped into a page like a normal component. The code is a separate chunk fetched on first render
 * (or on .preload()), and is shared with every other place that imports the same file.
 */
export function lazyLoad<M extends Record<string, unknown>, K extends keyof M & string = "default">(
  factory: () => Promise<M>,
  options: LazyLoadOptions<K> = {}
): LazyLoaded<Extract<M[K], AnyComponent>> {
  const key = (options.export ?? "default") as K;
  const Inner = lazyWithPreload(() =>
    factory().then((mod) => {
      const component = mod[key];
      if (!component) throw new Error(`lazyLoad: module has no export "${key}"`);
      return { default: component as AnyComponent };
    })
  );
  const fallback = options.fallback === undefined ? <LazyFallback /> : options.fallback;

  function Lazy(props: ComponentProps<Extract<M[K], AnyComponent>>) {
    return (
      <Suspense fallback={fallback}>
        <Inner {...props} />
      </Suspense>
    );
  }
  Lazy.displayName = `Lazy(${key === "default" ? "default" : key})`;
  Lazy.preload = Inner.preload;
  return Lazy as LazyLoaded<Extract<M[K], AnyComponent>>;
}

/**
 * Renders its children only once they scroll near the viewport (below-the-fold sections, long dashboards).
 * Pair with lazyLoad() so the child's code is also not downloaded until then. Stays rendered afterwards.
 */
export function LazyOnView({
  children,
  minHeight = 160,
  rootMargin = "200px",
  fallback,
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;
  return <div ref={ref}>{fallback ?? <LazyFallback minHeight={minHeight} />}</div>;
}

/**
 * Reuse another screen inside the current page by its menu URL, e.g. a Roles screen embedded in a tab.
 * It renders the same lazy chunk registered in PAGE_ROUTES, so the code is shared, not duplicated.
 */
export function LazyPage({ path, fallback }: { path: string; fallback?: ReactNode }) {
  const Page = getPageForPath(path);
  if (!Page) {
    if (import.meta.env.DEV) console.warn(`[LazyPage] No page registered for "${path}" in PAGE_ROUTES.`);
    return null;
  }
  return (
    <Suspense fallback={fallback === undefined ? <LazyFallback minHeight={240} /> : fallback}>
      {/* Page is a module-level entry from PAGE_ROUTES (stable identity), not a component made per render */}
      {createElement(Page)}
    </Suspense>
  );
}
