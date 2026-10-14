# Role-based routing & access control

How the frontend routes and the backend APIs decide what a **Developer** can
reach versus every other role.

## The two concepts

- **`is_superuser`** — boolean flag on `User` (`backend/app/models/user.py`).
- **Developer role** — a normal row in `roles` whose `name` is `"Developer"`.
  Nothing in the schema special-cases it; it's just a name.

Full access requires **both**: `is_superuser == True` AND `role.name == "developer"`
(case-insensitive). This is `has_full_access()` in
`backend/app/core/dependencies.py:78`. A superuser with a different role name,
or a "Developer"-named role whose user isn't flagged superuser, does **not**
get full access — they're treated like any other role and only see what Menu
Access grants them.

The exact same check (`is_superuser && role.name.trim().toLowerCase() === "developer"`)
is duplicated on the frontend in `DashboardGate.tsx:38` and `Sidebar.tsx:314`,
keyed off the same field names returned by `GET /api/auth/me`.

## Frontend routing (`frontend/src/App.tsx`)

- All routes except `/login` are nested under `AppLayout` → `DashboardLayout`
  (sidebar/topbar chrome).
- `DashboardLayout` only checks `isAuthenticated()` and redirects to `/login`
  if not — it does **not** check role. There is no generic
  `<ProtectedRoute>`/`<RequireRole>` wrapper around individual `<Route>`s.
- `/` and `/dashboard` both render `DashboardGate`, not the Dashboard page
  directly.
- `/developer-management/router-setup` (backed by `MenuManagement.tsx`) is the
  Developer-only "Router Setup" screen — creating/editing/deleting menus.

## `DashboardGate` — the Dashboard is Developer-only

`frontend/src/pages/DashboardGate.tsx`:

1. Fetches `GET /api/auth/me` and the user's granted menus in parallel.
2. If the user has full access (Developer) → render the real `Dashboard`.
3. Otherwise → `<Navigate>` to the first screen in their granted menu list
   (sorted by process/menu order).
4. If they have no granted menus at all → show "No screens are assigned to
   your role yet".

So non-Developers never see a dashboard; they land straight on whatever
screen their role can open.

**Other routes are not gated the same way.** If a non-Developer manually types
a URL their role doesn't have, the frontend doesn't block navigation to the
page component itself — the sidebar just never links to it, and the backend
rejects the underlying API calls (see below). The real security boundary is
the backend, not route guarding in React Router.

## Menu access matrix (DB-driven permissions)

- `RoleMenuAccess` (`backend/app/api/access.py`) is the grant table:
  `role_id × menu_id → allowed`. A parallel mechanism (`role_ids` array on
  `WorkflowStage`) grants workflow-stage access.
- `frontend/src/pages/MenuAccess.tsx` is the admin UI for this — a Roles ×
  Screens checkbox matrix. The Developer role is intentionally excluded from
  the matrix (it always has everything, so there's nothing to grant).
- `GET /api/menus/` (`backend/app/api/menu.py`) is what the sidebar actually
  renders from:
  - Developer → all active, non-deleted menus.
  - Everyone else → inner-joined against `RoleMenuAccess` for their
    `role_id`, with `DEVELOPER_ONLY_SCREENS` (Router Setup) excluded
    regardless of any grant.
- `frontend/src/components/Sidebar.tsx` hard-codes Dashboard, Router Setup,
  and the 4 Access Control screens for Developers so those never disappear
  even if the `menus` table is empty or misconfigured; everyone else's nav is
  built purely from the `/api/menus/` response.

## Backend enforcement (the actual security boundary)

Two FastAPI dependencies in `backend/app/core/dependencies.py` gate the APIs:

- **`get_superuser`** (line 86) — requires `has_full_access()`; used on
  Developer-only endpoints (Router Setup: create/update/delete/list menus).
  Raises 403 "Developer access required" otherwise.
- **`require_screen(*urls)`** (line 93) — allows Developers automatically, or
  any user whose role has a `RoleMenuAccess` grant for one of the given
  screen URLs. Used e.g. by the Access Control endpoints
  (`access.py`) gated to `MENU_ACCESS_SCREEN`.

Both dependencies, the frontend's menu filtering, and the sidebar's
hard-coded Developer screens all reference the same URL constants from
`backend/app/core/builtin_screens.py` (`DEVELOPER_ONLY_SCREENS`, the 4 Access
Control screen URLs) — so a hidden screen and its API are gated by the same
identifier on both sides.

## Summary

| | Developer | Other role |
|---|---|---|
| Dashboard (`/`, `/dashboard`) | Sees it | Redirected to first granted screen |
| Router Setup | Full access (`get_superuser`) | Hidden + 403 if called directly |
| Access Control screens | Full access | Needs explicit `RoleMenuAccess` grant via `require_screen` |
| Any other screen | Sees everything | Only what Menu Access granted their role |

Access is checked twice — once to decide what the UI shows, once by the
backend before the data actually moves — and both checks are driven from the
same `is_superuser + role.name == "developer"` rule and the same
`RoleMenuAccess` grant table, so there is no gap between what the sidebar
shows and what the API will actually allow.
