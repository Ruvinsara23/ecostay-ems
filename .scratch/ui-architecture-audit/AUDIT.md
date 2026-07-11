# UI Architecture Audit — navigation, layout, and system cohesion

Date: 2026-07-11. Trigger: owner-reported navigation confusion ("back from admin lands me on

STATUS: S0-S6 ALL IMPLEMENTED 2026-07-11 (commits a800cfb..HEAD). Remaining polish, deliberately deferred: foreground-push toast, badge/button unification, focus trap in ConfirmDialog, admin alert surface, grouped room picker.
Room 1", "Settings goes to the admin dashboard", "admin nav icons all at the bottom").
Method: 3 adversarial reviews (navigation/IA, owner-dashboard UX, cross-surface consistency)
+ CDP screenshots of the real rendered surfaces (desktop 1440, mobile 390).

**Verdict:** the admin console (rebuilt this week) is internally coherent; the OWNER dashboard
and the SEAMS between the two surfaces are where the architecture breaks. The three reported
symptoms all trace to one root disease: **no role-aware navigation model** — plus a second
independent one: **the owner dashboard's absolute-positioned layout** predates the tabs and
was never rebuilt around them.

---

## A. BLOCKERS

| # | Finding | Where |
|---|---|---|
| A1 | **Room picker overlaps the fixed header; page below is a void.** Screenshot-proven at 1440px: with >1 room, picker cards render under/through the floating "Live 3D Room View" header, and the rest of the viewport is empty. This is the first screen for every multi-room owner AND every admin. | `src/app/page.tsx` RoomArea/picker + fixed header (~:92-160, :265-292) |
| A2 | **AlertCenter is likely unreachable.** RoomLiveView's section is `h-full` inside an `overflow-hidden` root; AlertCenter is its next sibling — pushed below the clip with no scroll. The alert surface — a safety feature — may be invisible on every tab. | `src/app/page.tsx:114-160,213`, `room-live-view.tsx:233` |
| A3 | **Every realtime subscription swallows errors.** `onValue` is never given an error callback, so permission/network failures leave "Loading room…" forever (live view/devices/activity), or worse, render lies: AlertCenter says "No alerts — all quiet", charts say "No history yet". | `firebase-room-data-source.ts:74-180` + consumers |
| A4 | **Device-credential login loop.** `/login` redirects any signed-in session to `/` without a role check; `RequireSession` bounces non-dashboard roles back to `/login` → infinite redirect for a `role:'device'` credential. | `login/page.tsx:130-134`, `require-session.tsx:17-24` |
| A5 | **No role-based post-login landing** (root cause of reported issues). Admins land on the owner dashboard — a flat, global, ungrouped list of every room in the system — and the only path to the console is a gear mislabeled "Settings". | `login/page.tsx:130-134`, `page.tsx:252-261` |

## B. Reported symptoms (confirmed) + direct causes

1. **"Back from admin → Room 1"** — admin rail "Dashboard" (with a *back arrow* icon for a forward jump) goes to `/`, which auto-picks the first room of a flat all-rooms list. No admin-appropriate landing; no way to open a SPECIFIC room's live view from the console (property detail rooms are not links).
2. **"Settings goes to admin dashboard"** — owner-dashboard rail shows admins "Settings" → `/admin`, which since v2 lands on Properties. Label lies twice. `page.tsx:253-254`.
3. **"Admin nav icons all at the bottom"** — `mt-auto` on the nav group (`admin/layout.tsx:36`), inherited from the old single-page shell. Owner rail has items at top — the two rails have opposite gravity.

## C. SHOULD-FIX (by theme)

**Navigation / IA**
- Owner tabs are client state: no URLs, browser Back exits the app, refresh loses tab+room. Contradicts the console's URL-addressable design.
- "Home" tab is a phantom: renders Live View's content while highlighting a different rail item.
- Header always says "Live 3D Room View" on all four tabs.
- Breadcrumbs ("Admin / Properties / …") look clickable, are inert text.
- Property detail H1/breadcrumb show the raw id (`property_001`) even when a name exists.
- `/admin/owners` has no in-content back link (asymmetric with detail page).
- Owner deep-linking `/admin` ping-pongs through the guard before landing on `/`.
- Sign-out: hidden behind an unlabeled avatar (owner) vs explicit rail button (admin); no confirm on either.

**Owner dashboard UX**
- FCM bell: after permission *denied*, the button stays "Enable Alerts" and silently does nothing; errors only in a hover tooltip; granted-but-no-token looks identical to disabled.
- DeviceControls disabled with no explanation when commands haven't loaded/failed.
- Live-view widget rows are fixed-width (`w-72`/`w-80`): horizontal clipping at 390px; mobile rail stacks ~7 icons vertically eating the viewport.
- Foreground push messages only `console.log` — an alert arriving while the app is open shows nothing.
- Room picker/switcher hand-rolled; no truncation on long names; switcher pill overlaps floating headers on other tabs.

**Cross-surface consistency**
- Owner rail duplicates `src/ui/rail.tsx` verbatim (drift already: no `aria-current`, inline SVGs vs lucide).
- **Energy charts are still the old EMERALD GREEN** (`BRAND='#12a15e'` in `energy-charts.tsx:21-22`) inside the purple app.
- Two page-header systems; section h2 sizes differ (sm vs xl); card radius drift (`rounded-2xl` vs `rounded-[1.25rem]`); two "Disabled" badge styles; an undocumented `bg-ink` button variant; raw `green-500/red-500` status colors with no semantic token; three different brand marks ("i", "e·", "e·"-inverted).
- Login: signed-in visitors flash the form before redirect; hero gradient is hardcoded violet hex, not tokens.

**Chrome / plumbing**
- One `<title>` app-wide; no `not-found.tsx`; no `loading.tsx`/`error.tsx`; hard refresh on an admin page shows a chrome-less "Loading…" flash then a second in-page loading.

## D. What to ADD to align with the project

1. **Role-aware landing:** admin login → `/admin`; owner login → `/`; device/unknown role → explicit "this account cannot use the dashboard" screen (kills A4).
2. **Per-room live view as a route** (`/rooms/{pid}/{rid}` or query params): gives owners URLs/back-button, gives the admin console a "View live →" link per room (the missing admin→telemetry path), makes tabs bookmarkable.
3. **Admin alert visibility:** admins configure thresholds but never see alerts; surface an alert indicator/list in the console (read-only reuse of AlertCenter).
4. **Semantic status tokens** (`success`/`online`) in globals.css; repoint charts, tiles, bell.
5. **Route titles, branded 404, rail-preserving loading state.**
6. **One rail component, one gravity:** nav at top, Sign out at bottom, on both surfaces; single brand mark.
7. **Grouped/searchable room picker** (by property) — required before any multi-property pilot.

## E. Canonical UI spec (converge everything onto this)

- **Rail:** `src/ui/rail.tsx` on both surfaces; container `glass flex ... sm:w-[90px]`; brand mark top; primary items top; Sign out `mt-auto` bottom; active = `bg-brand text-white shadow-md` + `aria-current`; lucide 22/2.2; label `text-[11px] font-medium max-sm:hidden`.
- **Page header:** eyebrow `text-[11px] font-semibold uppercase tracking-wider text-ink-3` → h1 `text-2xl font-bold tracking-tight` (display NAME, never raw id) → subtitle `text-sm text-ink-2`. Section h2 `text-sm font-bold` + `bg-brand-soft text-brand` icon chip.
- **Card:** `glass rounded-2xl p-5 sm:p-6`.
- **Buttons:** brand pill primary / outline secondary / `bg-alarm` destructive; retire `bg-ink` variant; retries use primary.
- **Badge:** `rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide` tinted by `*-soft` tokens only.

## F. Proposed slices (fix order)

- **S0 — the reported trio + trivial wins:** admin rail gravity; "Settings"→"Admin" label+icon; Dashboard link icon/label ("Live rooms", no back-arrow); charts emerald→brand tokens. UI-only.
- **S1 — role-aware routing (RISK GATE #1: session flow):** login role landing; device-role dead-end screen; owner `/admin` bounce cleanup.
- **S2 — owner dashboard layout rebuild:** normal-flow layout (kill the fixed-header/absolute overlap), picker page that doesn't overlap, AlertCenter visibly placed, per-tab headers, mobile-safe rails/rows. Preserves the 3D room view and lavender design — this is plumbing, not restyle.
- **S3 — room routes + admin "View live →"** links; per-route titles; 404; loading.
- **S4 — subscription error honesty:** error callbacks through the port, error states in consumers (kills A3).
- **S5 — consistency sweep:** one rail, tokens, badges, buttons, brand mark; FCM bell states + foreground toast.
- **S6 — screenshot verification pass** (desktop+mobile CDP) + review panel, like admin-v2 slice 08.

Each slice: TDD, gates green, screenshot-verified before commit (the repo rules).
