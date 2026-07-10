# 01 - Chassis

Status: planned
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

Rebuild the admin shell as real App Router sub-routes with shared primitives, so
master -> detail navigation and deep links are expressible BEFORE any new view is built.
No new features — the existing three views keep working inside the new shell.

## Scope

- Replace the single-page `useState<'settings'|'rooms'|'owners'>` shell with sub-routes:
  `/admin` and `/admin/properties/[pid]`, with a shared `src/app/admin/layout.tsx`
  holding the rail (+ the Sign out from slice 00).
- Extract shared primitives to `src/ui/` (alongside `toggle.tsx`), and build from them:
  - `TextField` / `NumberField` + field styles (today duplicated 3x — AUDIT G).
  - `RailButton` (two independent rails today — AUDIT G).
  - `ListRow`.
  - `ConfirmDialog` (fixes AUDIT B's no-confirmation-on-destructive finding at the
    primitive level; wiring into existing destructive actions rides along here).
- Move `FakeAdminOperations` out of the production module
  (`src/admin/admin-operations.ts:78-141`, AUDIT B [HYG]) to
  `src/admin/admin-operations.fake.ts`.
- Establish the GET-list convention: new read endpoints are `GET`, no `POST {action}`
  overloads for reads (PRD architecture decision 3).
- Fix the admin<->dashboard routing bug (AUDIT A): `src/auth/require-session.tsx:26-27`
  force-redirects admins from `/` to `/admin`, making the owner dashboard unreachable
  for admins even though the admin rail links to `/`.

## Risk gates

- **#1 Auth/roles** — the `require-session.tsx` redirect change touches session handling.
  That specific change requires explicit human approval (see Stop before).
- Everything else is UI refactor + file moves; no rules, claims, or server auth changes.

## Test plan

- Existing Settings/Rooms/Owners tests keep passing inside the new shell.
- Unit tests for the extracted `src/ui/` primitives (including ConfirmDialog behavior).
- Unit test: admin session can reach both `/` and `/admin` after the redirect fix;
  owner routing behavior unchanged.
- `npm test` + `npm run typecheck` green before commit.

## Stop before

STOP and get human approval before applying the `src/auth/require-session.tsx`
redirect change (risk gate #1). The rest of the chassis may proceed without it.
