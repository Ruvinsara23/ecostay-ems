# PRD: Admin Management Console v2 (browse + manage the whole estate)

Status: draft-for-human-review
Feature slug: admin-console-v2
Created: 2026-07-09
Amended: 2026-07-09 — architecture assessment folded in (chassis slice + decisions below)
after the full frontend audit (`.scratch/frontend-audit/AUDIT.md`).
Builds on: `.scratch/admin-console/` (slices 01-04, done) and CONTEXT.md Auth & tenancy.

## Problem

The admin console (`/admin`) is **write-only**. Every view is a form that *creates*
something; there is almost no surface to *see* what exists or how it relates:

- No list of **properties** — admin types `property_001` into free-text boxes from memory.
- No list of **rooms** per property (Rooms view is a register form only).
- No list of **devices** or their account/provisioning/online status.
- No **property -> owners** view ("who owns / has access to this property"); only the
  reverse (owner -> properties) in the Owners list.
- **No sign-out** in the admin console at all.
- Owner dashboard still shows dead controls ("Settings coming soon", a no-op "Add Device"
  button, a dead edit pencil).

Net effect: it reads as a data-entry panel, not a management console — and unfinished.

## Goal

Turn the admin console into a real management console: browse the estate top-down
(**Properties -> Rooms/Devices -> Owners**), with every entity listed, related, and
actionable. Preserve the user-owned lavender/glass 3D design; make every on-screen control
functional (no placeholders shipped as done).

## Current state (verified in code, 2026-07-09)

Exists:
- `/admin` shell with 3 views (Settings, Rooms, Owners), `RequireAdmin` guard.
- Owners: `listOwners` (email, disabled, propertyIds), create/disable/reset. (owner -> property)
- Rooms: register-room form + create/reset device account. No lists.
- Settings: per-property tariff / circuit wattages / alert thresholds.
- `AdminOperations` port (UI never touches fetch/Admin SDK directly) + fake + HTTP adapter.

Data already available (no new firmware/contract needed):
- `properties/{pid}` (+ display name), `properties/{pid}/members/{uid}: 'owner'` (property -> owner).
- `users/{uid}/properties/{pid}: true` (owner -> property, one-read index).
- `ops/roomIndex/{pid}/{rid}: true` (registered rooms, Admin-SDK only).
- Device accounts = Firebase Auth users with `role:device` + propertyId/roomId claims (listable).
- `properties/{pid}/rooms/{rid}/latest.updatedAt` (online / last-seen).

Gaps: no property list, no room list, no device list/status, no property -> owners view,
no admin logout, blind ID-typing UX.

## Proposed model — Properties as the spine

Admin nav: **Properties** (default) · **Owners** · **Settings** · **Sign out**

- **Properties list**: every property — name, id, #rooms, #owners, #devices online. Click -> detail.
- **Property detail** (tabs or sections):
  - **Rooms**: registered rooms (name, id, device-account status, online/last-seen);
    register-room inline (reuse existing form).
  - **Devices**: per-room device account (exists? provisioned? online); create/reset
    credential inline (reuse existing slice-01 UI).
  - **Owners**: who owns / has access; assign an existing owner, remove access.
  - **Settings**: this property's tariff / wattages / thresholds (reuse existing Settings).
- **Owners** (global, enhanced): keep the list; cross-link to property detail.

## Architecture decisions (2026-07-09 assessment: foundations enough, component not)

Verdict: keep the seams (RequireAdmin, `authorizeAdmin`, the `AdminOperations` port + HTTP
adapter + fake, the API-route template). Four structural changes BEFORE building new views:

1. **Navigation -> real sub-routes.** The single-page `useState<'settings'|'rooms'|'owners'>`
   shell cannot express master -> detail and nothing is deep-linkable. Move to App Router:
   `/admin` (Properties list) and `/admin/properties/[pid]` (detail), with a shared
   `src/app/admin/layout.tsx` holding the rail (+ Sign out). Also resolves the
   admin <-> dashboard routing bug area (AUDIT A).
2. **Data-seam rule: admin reads are SNAPSHOT reads via `AdminOperations`.** New list/read
   endpoints are `GET`; the server joins what it needs (e.g. `ops/roomIndex` +
   `latest.updatedAt` -> `lastSeenAt`) and the UI renders it with a manual refresh.
   `RoomDataSource` live subscriptions remain the owner-dashboard seam (and legacy
   admin-settings until slice 7 folds it in). Live admin status is a later nice-to-have.
3. **Port growth conventions.** Lists are `GET` routes (no more `POST {action}` overloads
   for reads); `FakeAdminOperations` moves out of the production module to
   `src/admin/admin-operations.fake.ts`; typed field errors stay as-is.
4. **Shared primitives first.** Extract to `src/ui/` (alongside `toggle.tsx`):
   `TextField`/`NumberField` + field styles (today duplicated 3x), `RailButton` (2 rails),
   `ListRow`, and a `ConfirmDialog` (directly fixes AUDIT's no-confirmation-on-destructive
   finding). New views are built FROM these, not copy-pasted.

Scale note: `listOwners`-style N+1 reads and 1000-page Auth listing are fine at this
project's scale; do the same for devices, don't engineer around it now.

## Slices (vertical, test-first, design preserved)

0. **Shell fixes** — admin **Sign out**; remove/kill the dead owner-dashboard controls
   ("Settings coming soon", no-op "Add Device", dead edit pencil, inert notification pill).
   Small, unblocks, and clears the "cheap/unfinished" complaint immediately.
1. **Chassis** — `/admin` sub-routes + shared `layout.tsx` rail; shared primitives in
   `src/ui/` (fields, RailButton, ListRow, ConfirmDialog); split the fake to
   `admin-operations.fake.ts`; establish the GET-list convention. No new features —
   existing three views keep working, now inside the new shell.
2. **Read: list properties** — `AdminOperations.listProperties()` (name + counts) + server + tests.
3. **Properties list view** — browse-first `/admin`; ends blind ID typing.
4. **Read: rooms + device status per property** — `listRooms` / `listDevices` (account exists,
   `lastSeenAt` from `latest.updatedAt`) + server + tests.
5. **Property detail: Rooms + Devices** — lists with status; register-room + device-cred inline.
6. **Property detail: Owners** — property -> owners (read `members` back); assign existing
   owner / remove (members writes, via ConfirmDialog).
7. **Settings into property detail** + nav consolidation (retire the settings split-seam).
8. **UI cohesion + on-screen verification** (screenshots per repo rule).

## Risk gates

- #1 Auth/roles: every read/write behind the `admin` claim (reuse `authorizeAdmin`).
- New RTDB read paths / enumerations: **ask before adding** (schema shared with firmware/Functions).
- Listing device accounts via Admin SDK (#1).
- Expected **no client rules changes** (admins already read `properties/*`; `ops/**` stays Admin-SDK).
- **UI is user-owned**: preserve lavender/glass; this is wiring + new well-designed views, not a
  restyle of the existing aesthetic. A bolder visual change is a separate, explicit decision.

## Out of scope

- Owner-facing settings page (separate feature).
- Creating/managing other admins or role changes.
- Firmware / device provisioning changes (that's the firmware workstream, ADR-0007).

## Stop point

This PRD is a planning deliverable. Break into `issues/NN-*.md` and TDD one slice at a time
after human review; start with slice 0 (shell fixes), then slice 1 (chassis) before any
new surface is built. The frontend audit (`.scratch/frontend-audit/AUDIT.md`) is the
companion defect list — its 🔴 bugs (admin<->dashboard routing, FCM finish-or-remove
decision, unhandled room-list error) ride along with slices 0-1 where they touch the
same files.
