# 04 - Read: rooms + device status per property

Status: planned
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

Server-side reads for one property's rooms and devices with status, so the detail page
(slice 05) has real data. (Fills AUDIT C: no room list, no device list/status, no
online/last-seen anywhere.)

## Scope

- Add `listRooms(propertyId)` and `listDevices(propertyId)` to the `AdminOperations`
  port + HTTP adapter + fake:
  - Rooms: id, name, whether a device account exists, `lastSeenAt`.
  - Devices: per-room device account status — exists? provisioned? online/last-seen.
- `GET` routes under `/api/admin/*` per the slice-01 convention, behind `authorizeAdmin`.
- Server joins existing data only: `ops/roomIndex/{pid}` (registered rooms), Firebase
  Auth users with `role:device` + matching propertyId/roomId claims (device account
  exists), and `properties/{pid}/rooms/{rid}/latest.updatedAt` -> `lastSeenAt`.
- Snapshot reads (PRD decision 2). `listOwners`-style N+1 reads and 1000-page Auth
  listing are fine at this scale (PRD scale note) — do the same for devices.

## Risk gates

- **#1 Auth/roles** — admin-claim-verified reads; listing device accounts via the
  Admin SDK is explicitly under gate #1 (PRD Risk gates).
- New RTDB read paths beyond those in Scope: **ask before adding**. Expected: none.
- No client rules changes expected (`ops/**` stays Admin-SDK-only).

## Test plan

- Unit tests: room list join (registered room with/without device account; `lastSeenAt`
  present/absent); device status derivation (exists / provisioned / online).
- Route tests: admin succeeds; owner / unauthenticated denied; unknown property handled.
- Emulator integration: reads work against seeded RTDB + Auth emulator data.
- `npm test` + `npm run typecheck` + `npm run test:integration` green before commit.

## Stop before

Ask before reading any RTDB path not listed in Scope. Listing device accounts reuses
the already-approved role:device claim scheme read-only — flag anything beyond that.
