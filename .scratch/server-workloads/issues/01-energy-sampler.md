# 01 — Energy sampler on the free runtime

Status: ready-for-human (implemented 2026-07-04 — review; live cron wiring happens in slice 07)
Slice: 1 of 7 · Parent: `.scratch/server-workloads/PRD.md`

## What to build

`/api/cron/sample` (GET, `Authorization: Bearer ${CRON_SECRET}`, Node runtime): a pure
`sampleEnergy(deps, nowMs)` handler appends `{energy, power, occupancyState, sampledAt}` to
`properties/{pid}/energyHistory/{rid}` for every indexed room whose `latest` is fresh
(≤ 10 min); skips never-reported, stale, and energy-less rooms with a per-category count in
the response. Rooms come from `ops/roomIndex` (Admin-only path, maintained by the seeder for
now). Path note: history lives at **property level** (like the firmware's water history) so
room-node reads stay bounded.

## Acceptance criteria

- [ ] Wrong/missing secret → 401 and no database work; auth check is a pure, unit-tested fn.
- [ ] Fresh room → sample with exact fields, `sampledAt = now`; cumulative kWh copied verbatim.
- [ ] Never-reported / stale (>10 min) / missing-energy rooms are skipped and counted.
- [ ] Emulator: sample lands at `properties/property_001/energyHistory/room_001/{push}`.
- [ ] Seeder maintains `ops/roomIndex`; docs updated (.env.example: CRON_SECRET, FIREBASE_SERVICE_ACCOUNT).
- [ ] All gates green.

## Blocked by

None.

## Comments

**2026-07-04 (agent) — implemented via TDD.**

- `src/server/`: `isCronAuthorized` (fail-closed, unit-tested), `sampleEnergy` pure handler
  (clock-injected; 6 unit cases incl. multi-room and field-omission), `getAdminDatabase`
  (env-driven: Vercel JSON / local key file / emulator), `createSamplerDeps` +
  `listIndexedRooms` over `ops/roomIndex`. Route: `/api/cron/sample` (Node runtime, thin).
- Emulator proof: fresh room sampled verbatim + stale/unreported skipped; history
  accumulates across runs. Seeder now maintains `ops/roomIndex`; `.env.example` documents
  CRON_SECRET + FIREBASE_SERVICE_ACCOUNT (server-only).
- Verification: 100 unit + 22 emulator-integration tests, typecheck, lint, build (route
  visible as dynamic) — all green.
