# 02 - Read: list properties

Status: planned
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

Give the admin console its first estate-level read: `AdminOperations.listProperties()`
returning every property with name and counts, served by an admin-only GET route.
(Fills AUDIT C: no `listProperties`, property names never listed.)

## Scope

- Add `listProperties()` to the `AdminOperations` port: per property — id, display name,
  #rooms, #owners, #devices online.
- `GET /api/admin/properties` following the existing API-route template, behind
  `authorizeAdmin` (admin-claim-verified read). GET per the slice-01 list convention.
- Server joins existing data only (no new RTDB paths, no contract change):
  `properties/{pid}/name`, room count from `ops/roomIndex/{pid}` (Admin SDK),
  owner count from `properties/{pid}/members`, devices online derived from
  `properties/{pid}/rooms/{rid}/latest.updatedAt`.
- Update the HTTP adapter and `FakeAdminOperations` (in `admin-operations.fake.ts`).
- Snapshot read (PRD decision 2): no live subscription. N+1 reads are acceptable at
  this scale (PRD scale note) — do not engineer around it.

## Risk gates

- **#1 Auth/roles** — admin-claim-verified read via `authorizeAdmin`; non-admin denied.
- New RTDB read paths beyond those enumerated above: **ask before adding** (schema is
  shared with firmware/Functions). Expected: none.
- No client rules changes expected (`ops/**` stays Admin-SDK-only).

## Test plan

- Unit tests: server join produces correct name/counts, including a property with zero
  rooms and zero owners.
- Route tests: admin gets the list; owner / unauthenticated request is denied.
- Fake tests: `FakeAdminOperations.listProperties()` behavior for UI tests.
- `npm test` + `npm run typecheck` (+ emulator integration if the route reads RTDB paths
  not already covered) green before commit.

## Stop before

Ask before reading any RTDB path not listed in Scope. Otherwise proceed — this reuses
the already-approved `authorizeAdmin` pattern for a read-only endpoint.
