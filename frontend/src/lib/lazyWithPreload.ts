import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<unknown>;
};

/**
 * React.lazy plus a preload() that starts downloading the chunk early (link hover, idle time) and shares
 * the same promise with lazy(), so a page fetched ahead of time renders instantly with no loader.
 * A failed preload is forgotten, so the real render retries instead of reusing the rejected promise.
 */
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  let pending: Promise<{ default: T }> | null = null;
  const load = () => {
    pending ??= factory().catch((err) => {
      pending = null;
      throw err;
    });
    return pending;
  };
  const Component = lazy(load) as PreloadableComponent<T>;
  Component.preload = () => load().catch(() => {});
  return Component;
}
