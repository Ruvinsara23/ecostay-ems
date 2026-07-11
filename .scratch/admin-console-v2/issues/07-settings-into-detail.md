# 07 - Settings into property detail + nav consolidation

Status: done (2026-07-11) — settings embedded in detail (route-scoped, loading-gated); nav = Properties · Owners · Sign out; deviation: RoomDataSource write path kept (approved semantics), only discovery seam retired
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

Fold per-property Settings into the property-detail page, retire the admin
RoomDataSource/AdminOperations split-seam, and consolidate the admin nav to
**Properties · Owners · Sign out**.

## Scope

- Settings (tariff / circuit wattages / alert thresholds) becomes a section of
  `/admin/properties/[pid]`, reusing the existing `src/admin/admin-settings.tsx` form
  logic rebuilt on `src/ui/` fields.
- Retire the split seam (AUDIT G: split property-discovery seams): `admin-settings`
  currently discovers properties via `RoomDataSource.listAccessibleRooms` while the
  other admin views use `AdminOperations`. After this slice, admin surfaces use
  `AdminOperations` only; `RoomDataSource` live subscriptions remain the
  owner-dashboard seam (PRD decision 2).
- Property selection comes from the route (`[pid]`) — this also fixes AUDIT F:
  Settings hiding the picker with one property, and a zero-room property being
  invisible to Settings (the list was derived by deduping rooms).
- Nav consolidation: the standalone Settings rail entry is removed; rail becomes
  Properties · Owners · Sign out. Remove the now-dead standalone settings view code.
- Owners global view stays and cross-links to property detail.

## Risk gates

- None new. Settings save reuses the existing, already-approved settings write path
  with unchanged semantics; this slice moves where the form lives and how the property
  is chosen, not what it writes.

## Test plan

- Existing admin-settings tests migrated: load + save settings for the routed property,
  including a property with zero rooms.
- Test: no admin module imports `RoomDataSource` after this slice.
- Test: rail shows Properties / Owners / Sign out; old Settings entry gone; deep link
  to a property's settings section works.
- `npm test` + `npm run typecheck` green before commit.

## Stop before

Nothing — flag it if retiring the seam would change any save/write semantics.
