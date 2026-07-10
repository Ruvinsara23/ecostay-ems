# 00 - Shell fixes

Status: implemented — all gates green (256 unit tests, typecheck, lint) and verified on
screen via headless screenshots 2026-07-09. Admin-side changes committed; the owner-dashboard
file (`src/app/page.tsx`) also carries uncommitted owner-tabs/FCM WIP, so its commit is
bundled with that work's commit decision.
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

Kill the "cheap/unfinished" first impression: give the admin console a Sign out, remove
every dead control from the owner dashboard, and stop the room list hanging on a failed
fetch. Small, unblocks, high visible payoff.

## Scope

- Add **Sign out** to the admin console rail (AUDIT D: no admin sign-out anywhere,
  `src/app/admin/page.tsx:51-84`).
- Remove dead owner-dashboard controls in `src/app/page.tsx` (AUDIT D):
  - Owner "Settings" rail icon that fires a "coming soon" toast (`:189,245-249`).
  - No-op "Add Device" button (`:281-283`).
  - Dead edit pencil next to the room title (`:271-275`).
  - Inert "Notifications enabled" pill rendered as a button with no onClick (`:306-317`).
- Fix AUDIT A unhandled room-list error: `src/app/page.tsx:43-45` calls
  `listAccessibleRooms(...).then(...)` with no `.catch`, so a rejected fetch leaves the
  Spinner (`:51-53`) forever. Add an error state instead of an infinite spinner.
- Preserve the user-owned lavender/glass design; this is removal + wiring, not a restyle.

## Risk gates

- None. UI + tests only. Sign out reuses the existing client-side Firebase Auth sign-out
  already used by the owner dashboard; no auth semantics, rules, or server changes.

## Test plan

- Unit test: room-list fetch rejection renders an error state, not a perpetual spinner.
- Unit tests: removed controls are gone (no "Add Device", no settings-coming-soon icon,
  no edit pencil, no inert notification pill).
- Unit test: admin console renders a working Sign out control.
- `npm test` + `npm run typecheck` green before commit.

## Stop before

Nothing — no human approval required for this slice.
