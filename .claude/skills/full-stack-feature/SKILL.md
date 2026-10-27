---
name: full-stack-feature
description: Build a new screen or feature end to end in this React + FastAPI + Postgres app — model, migration, schema, API with screen-based access control, frontend service, page, route, and sidebar — following the pattern of the Support/tickets feature. Use when the user asks to add a new screen, module, page with data, CRUD feature, or anything that needs both a backend API and a frontend page.
---

# Build a full-stack feature

The Support screen (commit `30ccc8d`) is the reference implementation. When unsure how something is
done here, open the matching tickets file and copy its shape rather than inventing a new pattern.

| Layer | Reference file |
|---|---|
| Model | `backend/app/models/ticket.py` |
| Schemas | `backend/app/schemas/ticket.py` |
| API | `backend/app/api/tickets.py` |
| Screen URL constant | `backend/app/core/builtin_screens.py` |
| Router registration | `backend/app/api/router.py` |
| Alembic model import | `backend/alembic/env.py` |
| Frontend service | `frontend/src/services/ticket.ts` |
| Page | `frontend/src/pages/Support.tsx` |
| Route | `frontend/src/lib/lazyPages.ts` (`PAGE_ROUTES`) |

## 0. Settle the design first

Before writing code, state in a few lines: the screen URL, the table(s) and columns, who may do what
(Developer vs. other roles with the screen granted), and the endpoints. Ask the user only about real
ambiguities (e.g. who may edit/delete). Read `CLAUDE.md` for the access-control rules.

## 1. Backend

1. **Model** — `backend/app/models/<name>.py`. Inherit `AuditMixin, Base` (gives `created_at`,
   `updated_at`, `created_by_id`, `creator`). Keep allowed values as module-level tuples
   (`TICKET_STATUSES`) and add a short class docstring and `__repr__`.
2. **Register the model with Alembic** — add `import app.models.<name>  # noqa: F401` to
   `backend/alembic/env.py`, or autogenerate will not see the table.
3. **Schemas** — `backend/app/schemas/<name>.py`. `Create` / `Edit` / `Update` / `Out` models; use
   `Literal[...]` for enums, `Field(min_length, max_length)` for strings, `model_config =
   {"from_attributes": True}` on output models, `CreatorOut` from `app.schemas.base` for the creator.
4. **Screen URL** — add a constant in `builtin_screens.py` (e.g. `INVENTORY_SCREEN = "/inventory"`).
   If it should exist on every install, also add it to `DEFAULT_MENUS`; otherwise it is created in
   Router Setup. Only add to `DEVELOPER_ONLY_SCREENS` if no other role should ever get it.
5. **API** — `backend/app/api/<name>.py` with `router = APIRouter()`.
   - Every endpoint depends on `user=Depends(require_screen(<SCREEN>))`; Developer-only actions
     additionally check `has_full_access(user)` and raise 403. Never trust the frontend to hide things.
   - Records another user may not see return **404**, not 403 (see `_get_ticket`).
   - Set ownership explicitly (`created_by_id=user.id`) when "own records only" logic depends on it.
   - Strip and validate text server-side; raise `HTTPException(400, detail=...)` with a clear message.
   - Use `joinedload` for relationships you return, to avoid N+1 queries.
6. **Register** in `backend/app/api/router.py`:
   `api_router.include_router(<name>.router, prefix="/api/<name>", tags=["..."])`.

## 2. Database migration

Run from the repo root (they activate `backend/env` themselves):

```
backend\scripts\db_migrate.bat revision "add <name> table"
backend\scripts\db_migrate.bat upgrade
```

Then **read the generated file** in `backend/alembic/versions/` and check it only contains your
change (autogenerate can pick up unrelated drift). Note: `backend/alembic/versions/` is in
`.gitignore`, so migrations are local to each machine — tell the user if that matters for this change.

## 3. Frontend

1. **Service** — `frontend/src/services/<name>.ts`. Copy the `request<T>()` / `extractDetail()` helpers
   from `services/ticket.ts`: base URL from `API_BASE_URL`, session is an HttpOnly cookie (never handle
   tokens), errors surface the backend `detail`. Mirror the backend schemas as TS types.
2. **Page** — `frontend/src/pages/<Name>.tsx`. Build from existing pieces: `PageContainer` +
   `PageHeader`, `useTableData` with `TableSearchInput` / `TablePagination`, `CustomSelect`,
   `showError` / `showSuccess` from `lib/toast`, `lucide-react` icons. Tailwind classes must include
   `dark:` variants like the rest of the app. Follow the **ui-design** skill for the look, animation
   and UX states (loading / empty / error, confirmations, phone width).
3. **Route** — add `{ path: "/<url>", page: lazyPage(() => import("@/pages/<Name>")) }` to
   `PAGE_ROUTES` in `frontend/src/lib/lazyPages.ts`. The path must equal the screen URL constant.
4. **Sidebar** — usually nothing to do: non-Developers get it from `/api/menus/` once granted in Menu
   Access, and Developers see every menu. Only touch `Sidebar.tsx` for a hard-coded built-in screen.

## 4. Verify before saying done

- `cd frontend && npm run lint && npx tsc -b`
- `backend\env\Scripts\python.exe -c "import app.main"` (run inside `backend/`) to catch import errors
- Then use the **run-and-verify** skill to open the screen in a browser as a Developer and, where access
  rules matter, as a non-Developer role, and check that a direct API call without the grant returns 403.

Report what you verified and what you could not (e.g. no non-Developer test account).
