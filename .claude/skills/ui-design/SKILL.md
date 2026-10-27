---
name: ui-design
description: Design and polish UI, UX and animation for this React + Tailwind v4 app so new or changed screens match its existing glassmorphism design system (glass-card / glass-modal / glass-menu / glass-field / glass-btn, brand sky→blue gradient, dark mode, route and modal animations, skeleton shimmer) — with loading/empty/error states, accessible forms and focus, phone-width layouts, and framer-motion for enter/exit motion. Use when the user asks to build, redesign, polish, beautify or animate a page, component, modal, form or table, or says the UI/UX looks bad, plain, or inconsistent.
---

# UI, UX and animation for this app

The design system already exists — **reuse it, don't invent a new look**. Read
`frontend/src/index.css` (the glass classes and animations) and one finished page such as
`frontend/src/pages/Support.tsx` before writing UI. A new screen should look like it was always there.

## 1. Visual language

**Surfaces** (classes in `index.css`, each already has light + dark + no-blur fallback):

| Use | Class |
|---|---|
| Page cards, tables, panels | `glass-card rounded-2xl` |
| Modals / dialogs | `glass-modal rounded-2xl` (has its own enter animation) |
| Dropdowns, popovers, menus | `glass-menu rounded-xl` |
| Text inputs, selects, segmented controls | `glass-field rounded-xl border border-slate-200 dark:border-white/10` |
| Secondary buttons | `glass-btn rounded-xl` |
| Clickable cards | add `glass-lift` (hover lift) |

**Brand:** primary buttons use `bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400
hover:to-blue-500 text-white rounded-xl shadow-sm disabled:opacity-60` (index.css gives them the
lift/press automatically). Brand icon tiles use `from-[#00c6ff] to-[#0072ff]` (see `PageHeader`).
Focus rings: `focus:ring-2 focus:ring-sky-500/30`. Don't introduce new brand colors or hex values.

**Text:** headings `text-slate-900 dark:text-white`, body `text-slate-700 dark:text-slate-200`, muted
`text-slate-500 dark:text-slate-400`. Section labels: `text-[11px] font-semibold uppercase
tracking-wider text-slate-400`. Status badges: soft tint pills like `STATUS_META` in `Support.tsx`
(`bg-<color>-100 dark:bg-<color>-500/15 text-<color>-700 dark:text-<color>-300`).

**Every color needs a `dark:` pair.** Dark mode is class-based (`.dark` on `<html>`, toggled in TopBar).

**Layout:** `PageContainer` + `PageHeader` at the top of every page. Spacing on Tailwind's scale
(`gap-3`, `p-4`, `space-y-5`), radii `rounded-xl` (controls) / `rounded-2xl` (surfaces).
Icons from `lucide-react`, usually `w-4 h-4`.

## 2. Components to reuse (don't rebuild them)

`PageContainer` / `PageHeader` (`loading` prop gives a skeleton header), `useTableData` +
`TableSearchInput` / `TablePagination` (`DataTableControls`), `CustomSelect`, `CustomCheckbox`,
`RoleMultiSelect`, `SearchBar`, `DashboardSkeleton`, toasts from `lib/toast` (`showSuccess`,
`showError`, `showUpdate`). Modals render through `createPortal` to `document.body` (see Support.tsx).
If a pattern is used on 2+ screens and has no shared component yet, extract one into `components/`.

## 3. Animation

Prefer what already exists, in this order:

1. **Built-in CSS** — pages get `route-fade-in` (staggered sections) from the layout, modals and menus
   animate via `glass-modal` / `glass-menu`, buttons and `glass-lift` cards already lift. Don't add a
   second animation on top of these.
2. **Tailwind transitions** for hover/focus/state: `transition-colors`, `transition-all duration-150`.
3. **framer-motion** (installed; see `pages/Login.tsx`) only for what CSS can't do well:
   `AnimatePresence` for exit animations (closing panels, removing list rows, switching tabs), `layout`
   for reordering, staggered lists of cards.

Rules:
- Short and calm: 150–250 ms for UI feedback, ≤ 450 ms for page/section entrances; ease-out
  (`cubic-bezier(0.22, 1, 0.36, 1)` matches the app). Small distances: 4–14px, scale ≥ 0.97.
- Animate only `opacity` and `transform` (not width/height/top/left; no blur on large lists).
- Motion explains something (where a thing came from, what changed) — never decoration that delays work.
- **Always respect reduced motion:** CSS in `@media (prefers-reduced-motion: reduce)`, and in
  framer-motion use `useReducedMotion()` to drop movement and keep only opacity.

## 4. UX checklist for every screen

- **States:** loading (skeleton blocks `bg-slate-200 dark:bg-white/10` inside `animate-pulse` — the app
  adds the shimmer), empty (icon + one line + primary action), error (message + retry), and success
  feedback via toast. No blank areas or layout jump when data arrives.
- **Forms:** labels on every field, inline validation messages near the field, disable the submit
  button and show progress while saving, keep input on error, Enter submits, Esc closes modals.
- **Destructive actions** (delete, deactivate) ask for confirmation in a modal that names the item.
- **Tables:** search, pagination, sensible sort, truncated long text with `title`, row actions visible
  on hover and always reachable by keyboard.
- **Responsive:** works at 390px wide — stack columns, horizontal scroll only inside tables, tap
  targets ≥ 40px, modals fit `max-h-[calc(100vh-2rem)]` with internal scroll.
- **Accessibility:** real `<button>`/`<a>`, `aria-label` on icon-only buttons, visible focus (global
  focus ring exists — don't remove outlines), contrast readable in both themes, modals trap focus and
  return it on close.
- **Copy:** short, plain, specific ("Ticket deleted", not "Operation completed successfully").

## 5. Check it visually

With the app running (see the **run-and-verify** skill), use Playwright MCP to screenshot the screen in
**light**, **dark**, and at **390px** width, plus the loading, empty and error states and any modal.
Look at the screenshots, fix what looks off (alignment, spacing, contrast, overflow), and re-check.
Then `cd frontend; npm run lint; npx tsc -b`.

Report what changed and include the screenshots or describe what you saw.
