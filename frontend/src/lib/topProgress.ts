// State behind the YouTube-style progress bar at the top of the window (see TopProgressBar.tsx).
//
// A "navigation" starts the moment a menu link is clicked (before React Router has even swapped the
// page -- route changes run in a transition, so the old page stays up while the new one's code loads,
// which otherwise looks like the click did nothing). It ends once the new route has committed AND every
// API request it kicked off has come back, after a short settle so a page that chains requests doesn't
// make the bar finish and restart. A hard cap guarantees the bar can never get stuck.

const SETTLE_MS = 150;
const MAX_MS = 15000;

let active = false;
let committed = false;
let inflight = 0;
let settleTimer: number | undefined;
let capTimer: number | undefined;
const listeners = new Set<(active: boolean) => void>();

function emit() {
  listeners.forEach((fn) => fn(active));
}

function finish() {
  window.clearTimeout(settleTimer);
  window.clearTimeout(capTimer);
  if (!active) return;
  active = false;
  committed = false;
  inflight = 0;
  emit();
}

function scheduleFinish() {
  window.clearTimeout(settleTimer);
  if (!committed || inflight > 0) return;
  settleTimer = window.setTimeout(() => {
    if (committed && inflight === 0) finish();
  }, SETTLE_MS);
}

/** A link was clicked / back-forward pressed: show progress right away, before the route commits. */
export function beginNavigation() {
  window.clearTimeout(settleTimer);
  committed = false;
  if (active) return;
  active = true;
  inflight = 0;
  window.clearTimeout(capTimer);
  capTimer = window.setTimeout(finish, MAX_MS);
  emit();
}

/** The new route is on screen. Programmatic navigate()/<Navigate> never went through a click, so this
 * also opens a navigation if none is running -- the new page's own data requests are then tracked. */
export function routeCommitted() {
  if (!active) beginNavigation();
  committed = true;
  scheduleFinish();
}

/** Counts an API request towards the current navigation. Requests outside a navigation (background
 * polling, saves from a form) are ignored, so the bar only ever means "the page is loading". */
export function trackRequest<T>(promise: Promise<T>): Promise<T> {
  if (!active) return promise;
  inflight++;
  window.clearTimeout(settleTimer);
  const done = () => {
    if (!active) return;
    inflight = Math.max(0, inflight - 1);
    scheduleFinish();
  };
  promise.then(done, done);
  return promise;
}

export function subscribeProgress(fn: (active: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isProgressActive() {
  return active;
}
