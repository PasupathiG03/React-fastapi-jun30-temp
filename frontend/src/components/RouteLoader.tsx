import GlobalPageLoader from "@/components/GlobalLoader";

/**
 * Universal Suspense fallback for lazy-loaded routes.
 * Reuses the global page skeleton loader across all page transitions.
 */
export default function RouteLoader() {
  return <GlobalPageLoader />;
}
