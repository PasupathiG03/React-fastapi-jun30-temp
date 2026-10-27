---
name: security-check
description: Security-review changes in this React + FastAPI app against its own access-control and hardening rules — require_screen / has_full_access on every endpoint, 404-vs-403 for other users' records, HttpOnly session cookie, CSP, no secrets in code, safe SQL, frontend lint rules — then run the dependency audits. Use when the user asks for a security check/review/audit, before committing or opening a PR, or after adding or changing an API endpoint, auth, cookies, or anything that handles user input.
---

# Security check for this app

Scope: the current diff (`git diff` + `git diff --staged`, plus untracked files) unless the user names
other files or asks for the whole app. Report only real, specific problems with `file:line`, why it is
exploitable, and the fix. Don't pad the report with generic advice.

## 1. Access control (the main risk here — see `CLAUDE.md`)

For every new or changed endpoint in `backend/app/api/`:
- It depends on `require_screen(<SCREEN>)` or `get_superuser` — none left open by accident. Only
  login/health-type endpoints may be unauthenticated.
- The screen constant comes from `backend/app/core/builtin_screens.py` and matches the frontend route
  path in `frontend/src/lib/lazyPages.ts`.
- Developer-only actions also check `has_full_access(user)` and raise 403. Full access must be
  `is_superuser AND role.name == "developer"` — never just one of them, never a role-name check alone.
- Per-user data is filtered by owner in the query (e.g. `created_by_id == user.id`), and another user's
  record returns **404**, not 403, so IDs can't be probed (pattern: `_get_ticket` in `api/tickets.py`).
- Ownership is set server-side from `user.id`, never taken from the request body.
- Update endpoints use explicit schemas — no `**payload` that would let a client set `is_superuser`,
  `role_id`, `created_by_id`, or `status` it shouldn't.
- Hiding something in the sidebar is not protection: the API must refuse it too.

## 2. Input, data, and errors

- SQLAlchemy ORM / bound parameters only — flag any f-string or `%` formatting inside `text(...)`.
- Pydantic schemas bound string lengths (`Field(max_length=...)`) and use `Literal[...]` for enums.
- Error `detail` messages don't leak stack traces, SQL, or whether a username exists.
- File uploads / CSV import (`lib/importCsv.ts`, `uploads/`): type and size limits, no path traversal.

## 3. Session, auth, and headers

- Session stays in the HttpOnly cookie (`app/core/session.py`): no token in response bodies,
  `localStorage`, or JS-readable cookies; `COOKIE_SAMESITE` stays `strict` unless there's a reason.
- JWT decode keeps `algorithms=[settings.ALGORITHM]` (`app/core/security.py`).
- CORS `allow_origins` stays an explicit list — never `"*"` with credentials.
- Login rate limiting (`app/core/ratelimit.py`) still applies to any new auth path.
- CSP: API sends its own header (`app/main.py`); frontend CSP is built in `frontend/vite.config.ts`.
  Flag any new `unsafe-inline` / `unsafe-eval` in `script-src`, or new external origins.

## 4. Frontend

- No `dangerouslySetInnerHTML`, `eval`, `new Function`, `javascript:` URLs, unsandboxed iframes, or
  `target="_blank"` without `rel="noopener"` — these are enforced by `frontend/.oxlintrc.json`, so
  run the lint rather than eyeballing.
- No secrets, internal URLs, or credentials in frontend code — everything there is public.

## 5. Secrets

- Nothing secret is committed: grep the diff for keys, passwords, tokens, connection strings.
- `.env` files stay git-ignored; new settings are added to `backend/.env.example` with a placeholder.
- Do **not** read `backend/.env` (it is denied in `.claude/settings.json`) and never print secret values.

## 6. Run the automated checks (same as CI, `.github/workflows/security-scan.yml`)

```
cd frontend; npm run security          # npm audit (high+) + oxlint security rules + tsc
backend\env\Scripts\python.exe -m pip_audit -r backend\requirements.txt --ignore-vuln PYSEC-2026-4298 --ignore-vuln PYSEC-2026-1325
```

If `pip_audit` is not installed in the venv, say so and ask before installing it.

## 7. Report

Group findings as **High / Medium / Low**, each with `file:line`, the concrete attack, and the fix.
Then list the check results (pass/fail with output). If nothing is found, say so plainly and state what
was covered. Offer to fix; don't change code unless asked.
