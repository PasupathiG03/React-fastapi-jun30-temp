// The backend address comes from API_URL (root .env, read by vite.config.ts); unset means same host as the page.
// Empty __API_URL__ = same host the page was opened from, API port BACKEND_PORT (works on any IP address).
export const API_BASE_URL: string =
  __API_URL__ || `${window.location.protocol}//${window.location.hostname}:${__API_PORT__}`;
