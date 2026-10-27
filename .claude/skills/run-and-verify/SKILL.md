---
name: run-and-verify
description: Start this app's FastAPI backend (port 8107) and Vite frontend (port 8106), then drive it in a real browser with the Playwright or Chrome DevTools MCP servers to confirm a change works — log in, open the screen, click through, check the console and network for errors, take screenshots. Use when asked to run, start, test, check, or screenshot the app, or after finishing a UI or API change.
---

# Run the app and verify in a browser

## 1. Start the servers (if not already running)

Check first; don't start a second copy:

```powershell
Get-NetTCPConnection -LocalPort 8107,8106 -State Listen -ErrorAction SilentlyContinue
```

Start whatever is missing as **background** commands (they run until stopped):

- Backend: `backend\scripts\run.bat dev` → http://localhost:8107 (auto-reload; API docs at `/docs`)
- Frontend: `cd frontend; npm run dev` → http://localhost:8106

Wait until each port is listening before opening the browser. If the backend fails, read its output —
the usual causes are Postgres not running or `backend/.env` missing (`DATABASE_URL`, see `.env.example`).
Never print or copy values from `backend/.env`.

## 2. Log in

The login page is http://localhost:8106/login (fields: "Enter your username", "Enter your password").
Ask the user for test credentials — do not guess passwords or read them from files. A Developer account
(superuser + "Developer" role) sees everything; to test access rules you also need a non-Developer
account. Users are created with `backend\env\Scripts\python.exe backend\scripts\create_user.py`
(interactive — the user should run it).

## 3. Drive the browser

Prefer **Playwright MCP** (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`,
`browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`) for user flows.
Use **Chrome DevTools MCP** when you need deeper debugging: performance traces, detailed network
request/response bodies, or evaluating scripts in the page.

For the screen you changed:
1. Navigate to it and take a snapshot — confirm it renders, with no error toast or blank area.
2. Exercise the change: create / edit / delete, filters, pagination, empty state.
3. Check the console for errors and the network panel for failed (4xx/5xx) `/api/` calls.
4. Toggle dark mode (TopBar) if you changed styling — every color needs a `dark:` variant.
5. Check a narrow viewport (~390px) if the layout changed.
6. For access-controlled features: as a non-Developer without the grant, the screen must not be in the
   sidebar and its API must return 403 (`require_screen`). See `CLAUDE.md`.

## 4. Report

Say exactly what you checked and what you saw (attach a screenshot when useful), what failed, and what
you could not test. Leave the servers running unless the user asks you to stop them
(`stop_all.bat` stops both).
