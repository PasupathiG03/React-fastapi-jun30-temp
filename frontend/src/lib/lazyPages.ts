import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazyWithPreload";
import { APP_ROUTES } from "@/lib/routes";

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// ADDING A NEW MENU / SCREEN
//   1. Create the page in src/pages/MyScreen.tsx (default export).
//   2. Add ONE line to PAGE_ROUTES below:  { path: "/my-process/my-screen", page: lazyPage(() => import("@/pages/MyScreen")) },
//   3. Create the menu with the same URL in Router Setup and grant it in Menu Access.
// That's it -- App.tsx builds its <Route>s from this list, so the page is automatically lazy-loaded,
// preloaded on hover/idle, and shows the loading bar + page transition. Never import a page statically
// (`import X from "@/pages/X"`): that pulls it into the startup bundle. The linter blocks it outside this file.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type Page = PreloadableComponent<React.ComponentType>;
const lazyPage = (factory: () => Promise<{ default: React.ComponentType }>): Page => lazyWithPreload(factory);

export const Login = lazyPage(() => import("@/pages/Login"));
export const DashboardLayout = lazyWithPreload(() => import("@/components/DashboardLayout"));
export const Dashboard = lazyPage(() => import("@/pages/Dashboard"));
const DashboardGate = lazyPage(() => import("@/pages/DashboardGate"));

export interface PageRoute {
  path: string;
  page: Page;
  /** Extra chunks this URL may render (e.g. the gate's Dashboard), fetched along with it. */
  alsoPreload?: Page[];
}

/** Both addresses that open the dashboard gate. Use this instead of repeating the two paths. */
export const DASHBOARD_PATHS = ["/", APP_ROUTES.DASHBOARD];

/** Every screen inside the app shell (sidebar + top bar). One entry per menu URL. */
export const PAGE_ROUTES: PageRoute[] = [
  ...DASHBOARD_PATHS.map((path) => ({ path, page: DashboardGate, alsoPreload: [Dashboard] })),

  // Access Control
  { path: APP_ROUTES.USER_MANAGEMENT, page: lazyPage(() => import("@/pages/UserManagement")) },
  { path: APP_ROUTES.ROLE_MANAGEMENT, page: lazyPage(() => import("@/pages/RoleManagement")) },
  { path: APP_ROUTES.MENU_ACCESS, page: lazyPage(() => import("@/pages/MenuAccess")) },
  { path: APP_ROUTES.WORKFLOW_MANAGEMENT, page: lazyPage(() => import("@/pages/WorkflowManagement")) },

  // Image Studio Consolidated Workspace
  { path: APP_ROUTES.IMAGE_STUDIO, page: lazyPage(() => import("@/pages/bigbasket/BatchProcessing")) },
  { path: APP_ROUTES.IMAGE_STUDIO_DASHBOARD, page: lazyPage(() => import("@/pages/bigbasket/BatchProcessing")) },
  { path: APP_ROUTES.IMAGE_STUDIO_CREATE_BATCH, page: lazyPage(() => import("@/pages/bigbasket/BatchProcessing")) },
  { path: APP_ROUTES.IMAGE_STUDIO_BATCH_PROCESSING, page: lazyPage(() => import("@/pages/bigbasket/BatchProcessing")) },
  { path: APP_ROUTES.IMAGE_STUDIO_MANUAL_REVIEW, page: lazyPage(() => import("@/pages/bigbasket/BatchProcessing")) },
  { path: APP_ROUTES.IMAGE_STUDIO_REVIEW_STUDIO, page: lazyPage(() => import("@/pages/bigbasket/ReviewStudio")) },
  { path: APP_ROUTES.IMAGE_STUDIO_REPORTS, page: lazyPage(() => import("@/pages/bigbasket/BatchProcessing")) },

  // Developer Management
  { path: APP_ROUTES.ROUTER_SETUP, page: lazyPage(() => import("@/pages/MenuManagement")) },

  // API Monitoring & Quota Dashboard
  { path: APP_ROUTES.API_DASHBOARD, page: lazyPage(() => import("@/pages/ApiDashboard")) },
  { path: APP_ROUTES.API_MONITORING_GEMINI, page: lazyPage(() => import("@/pages/GeminiApiMonitoring")) },

  // Support
  { path: APP_ROUTES.SUPPORT, page: lazyPage(() => import("@/pages/Support")) },

  // Workflow stages opened from the sidebar (empty page for now: work items were removed)
  { path: "/workflows/:workflowSlug/:stageSlug", page: lazyPage(() => import("@/pages/StageWorkspace")) },
];

const normalize = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);
const ROUTE_BY_PATH = new Map(PAGE_ROUTES.map((r) => [r.path, r]));

/** The lazy page registered for a URL, so another page can reuse it (see <LazyPage> in lazyLoad.tsx). */
export function getPageForPath(pathname: string): Page | undefined {
  return ROUTE_BY_PATH.get(normalize(pathname))?.page;
}

/** True when a URL has a page registered above (used to flag menus created without a page yet). */
export function hasPageRoute(pathname: string) {
  return ROUTE_BY_PATH.has(normalize(pathname));
}

/** Start downloading the code for a URL's page (no-op for unknown URLs or ones already loaded). */
export function preloadRoute(pathname: string) {
  const path = normalize(pathname);
  if (path === "/login") return void Login.preload();
  DashboardLayout.preload();
  const route = ROUTE_BY_PATH.get(path);
  route?.page.preload();
  route?.alsoPreload?.forEach((p) => p.preload());
}

/** Once the browser is idle, fetch every remaining page chunk so later menu clicks are instant. */
export function preloadAllRoutesWhenIdle() {
  const run = () => PAGE_ROUTES.forEach((r) => preloadRoute(r.path));
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 4000 });
  else window.setTimeout(run, 1500);
}

let linkPrefetchInstalled = false;

/** Preload a page as soon as the pointer rests on / focus reaches a link to it, before the click lands. */
export function installLinkPrefetch() {
  if (linkPrefetchInstalled || typeof document === "undefined") return;
  linkPrefetchInstalled = true;
  const onIntent = (e: Event) => {
    const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin === window.location.origin) preloadRoute(url.pathname);
  };
  document.addEventListener("pointerover", onIntent, { passive: true });
  document.addEventListener("focusin", onIntent);
  document.addEventListener("touchstart", onIntent, { passive: true });
}
