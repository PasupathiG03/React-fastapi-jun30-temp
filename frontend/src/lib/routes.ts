/**
 * Single source of truth for all application routes and built-in screens.
 * Use these constants instead of hardcoding route paths across components.
 */

export const APP_ROUTES = {
  DASHBOARD: "/dashboard",
  ROUTER_SETUP: "/developer-management/router-setup",
  ROLE_MANAGEMENT: "/access-control/role-management",
  USER_MANAGEMENT: "/access-control/user-management",
  MENU_ACCESS: "/access-control/menu-access",
  WORKFLOW_MANAGEMENT: "/access-control/workflow-management",
  SUPPORT: "/support",
  IMAGE_STUDIO: "/image-studio",
  IMAGE_STUDIO_DASHBOARD: "/image-studio/dashboard",
  IMAGE_STUDIO_CREATE_BATCH: "/image-studio/create-batch",
  IMAGE_STUDIO_BATCH_PROCESSING: "/image-studio/batch-processing",
  IMAGE_STUDIO_MANUAL_REVIEW: "/image-studio/manual-review",
  IMAGE_STUDIO_REVIEW_STUDIO: "/image-studio/review-studio",
  IMAGE_STUDIO_REPORTS: "/image-studio/reports",
  API_DASHBOARD: "/api-dashboard",
  API_MONITORING_GEMINI: "/api-monitoring/gemini",
} as const;

export interface ScreenEntry {
  path: string;
  label: string;
  group: string;
}

export const BUILTIN_DEV_SCREENS: ScreenEntry[] = [
  { path: APP_ROUTES.DASHBOARD, label: "Dashboard", group: "Main Menu" },
  { path: APP_ROUTES.ROUTER_SETUP, label: "Router Setup", group: "Developer Management" },
  { path: APP_ROUTES.ROLE_MANAGEMENT, label: "Role Management", group: "Access Control" },
  { path: APP_ROUTES.USER_MANAGEMENT, label: "User Management", group: "Access Control" },
  { path: APP_ROUTES.MENU_ACCESS, label: "Menu Access", group: "Access Control" },
  { path: APP_ROUTES.WORKFLOW_MANAGEMENT, label: "Workflow Management", group: "Access Control" },
  { path: APP_ROUTES.SUPPORT, label: "Support", group: "Support" },
  { path: APP_ROUTES.IMAGE_STUDIO, label: "Image Studio", group: "Image Studio" },
];

