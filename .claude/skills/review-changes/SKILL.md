---
name: review-changes
description: Code-review the current changes in this React + FastAPI + Postgres app for bugs and for this project's own conventions — access control, layer wiring (model → migration → schema → API → router → service → page → route), SQLAlchemy and Pydantic patterns, frontend service/page patterns, dark mode, lazy-loaded pages — then run lint and type checks. Use when the user asks to review code, review changes, check before commit or PR, or "is this ready".
---

# Review changes in this project

Scope: `git diff`, `git diff --staged` and untracked files, unless the user names a branch, commit,
PR, or files. Read each changed file in full, not just the hunk, and open the code it calls.

Report only real problems: a concrete input or situation that produces a wrong result, a crash, a
security hole, or a break from a convention below. No style nitpicks the linters already cover, no
"consider adding comments". If unsure, verify by reading code or running it before reporting.

## 1. Correctness (most important)

- Logic: wrong conditions, off-by-one, missing `None`/empty handling, wrong status codes.
- DB: missing `db.commit()`, commit before validation, `db.refresh` / re-query needed after commit,
  N+1 queries (use `joinedload` like `api/tickets.py`), filters that leak other users' rows.
- Pydantic: `model_dump(exclude_unset=True)` for partial updates; output models have
  `model_config = {"from_attributes": True}`; enum values match the model's allowed tuples.
- Frontend: stale state after create/edit/delete (list not refreshed), missing loading/error states,
  `useEffect` dependencies that cause loops or stale closures, unhandled promise rejections (every
  API call surfaces errors via `showError`).
- Backend and frontend types agree: field names, optional vs required, enum values, URL paths.

## 2. Wiring — nothing half-connected

For a new or changed feature, check every layer exists and matches (reference: Support/tickets):
- Model imported in `backend/alembic/env.py`, and a migration generated and reviewed.
- Router registered in `backend/app/api/router.py` with the right `/api/<name>` prefix.
- Screen URL constant in `builtin_screens.py` == route path in `frontend/src/lib/lazyPages.ts`
  == URL the service/sidebar uses.
- Page registered in `PAGE_ROUTES`, never imported directly (oxlint `no-restricted-imports`).

## 3. Access control (summary — run `security-check` for the full pass)

- Every endpoint depends on `require_screen(...)` or `get_superuser`.
- Developer-only actions check `has_full_access(user)`; other users' records return 404.
- The frontend hiding a button is never the only protection.

## 4. Project conventions

- Backend: models inherit `AuditMixin, Base`; text is stripped and validated server-side with clear
  `HTTPException(detail=...)` messages; no raw SQL strings with formatting.
- Frontend services follow `services/ticket.ts` (`API_BASE_URL`, cookie session, `extractDetail`);
  no tokens in `localStorage`.
- Pages use `PageContainer` / `PageHeader`, `useTableData` + `DataTableControls`, `CustomSelect`,
  `lib/toast`, `lucide-react` icons — not new one-off versions of these.
- Tailwind colors have `dark:` variants; layout works at phone width.
- Comments explain *why*, matching the existing style; no dead code or leftover `console.log`.
- Docs: if access-control behavior changed, `CLAUDE.md` still describes it correctly.

## 5. Run the checks

```
cd frontend; npm run lint; npx tsc -b
cd backend; .\env\Scripts\python.exe -c "import app.main"
```

Lint warnings that existed before this change are not findings; new errors or new warnings in
changed lines are.

## 6. Report

List findings most severe first: **file:line**, what goes wrong (the concrete scenario), and the fix.
Then the check results. If nothing is wrong, say so and say what you covered. Offer to fix — don't
edit code unless the user asks.
