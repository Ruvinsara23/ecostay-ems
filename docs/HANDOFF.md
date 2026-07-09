# HANDOFF — EcoStay EMS (state & where to continue)

_Last updated 2026-07-09. Read `AGENTS.md` for the operating rules; this file is "where are we, what's next"._

EcoStay EMS is a smart-IoT energy management system for Sri Lankan tourist accommodations:
an ESP32 per room writes telemetry to Firebase RTDB; a Next.js dashboard (Firebase Auth + RTDB)
gives owners live monitoring, control, cost, and savings. **The firmware is an immutable contract
(`docs/firmware-contract.md`); the dashboard adapts to it, never the reverse.**

## Status: v1 is feature-complete and deployed

Live at `https://ecostay-ems.vercel.app` (auto-deploys on push to `main`). Local `main` has not
been pushed. Recent local-only work includes:

- firmware workstream slice 00: PRD + sliced plan + CONTEXT vocabulary
- firmware workstream slice 01: device credential provisioning
- firmware workstream slice 02: device-scoped RTDB rules draft
- UI cleanup: admin nav, post-login admin redirect, responsive room header

Latest local verification for slice 02: **235 unit tests + 51 emulator-integration tests green**;
`typecheck` clean.

## What's built

| Area | What | Key files |
|---|---|---|
| **Auth & tenancy** | Email/password login, role from custom claims (owner/admin/device), route guard, per-property membership; owners see assigned rooms, admins see all | `src/auth/*`, `src/rooms/room-data-source.ts` (`listAccessibleRooms`) |
| **Live telemetry** | Firmware-contract TS types, live `latest` view, occupancy/climate/power(simulated)/gas/water/activity/relays, offline honesty (15 s UI mark, server-corrected clock) | `src/telemetry/*`, `src/rooms/room-live-view.tsx`, `room-scene.tsx` |
| **Device control** | Owner toggles `devices/*` relays (lights/exhaustFan/waterPump/motionDetection); `mainRelay` excluded at type level; disabled offline; gas-alarm note | `src/rooms/room-live-view.tsx` (DeviceControls) |
| **Server workloads** (free runtime, ADR-0010) | 5-min energy **sampler**, 1-min **tick** (offline+gas/temp/water **alerts** lifecycle + **vacancy-cutoff automation**), nightly **rollup** (+ dry-run-gated prune) | `src/server/*`, `src/app/api/cron/{sample,tick,rollup}/route.ts` |
| **Charts & alerts UI** | 24 h power line + 7-day kWh bars; alert center with acknowledge | `src/rooms/energy-charts.tsx`, `alert-center.tsx` |
| **Cost (tariff)** (ADR-0008) | Regime/band CEB bill engine; "Estimated bill this month" from month-to-date kWh × tariff (property = **H-1**) | `src/tariff/*`, shown in `energy-charts.tsx` |
| **Savings (OBJ-07)** | Nightly `avoidedKWh` = controlled-circuit wattage × confirmed-vacant time; "Saved this month" priced at the **marginal** band rate (NOT bill-delta — that overstates near band edges) | `src/server/rollup.ts`, `src/tariff/savings.ts` |
| **UI** | Owner's redesign: purple/lavender glass, Inter font, 3D-room image (`public/3d-model.png`) with clickable sensor letters, icon rail | `src/app/{page,layout,login}.tsx`, `src/app/globals.css`, `room-scene.tsx` |
| **Admin Console** | Admin-only `/admin` with Settings, Rooms, Owners, and local slice-01 device credential create/reset. Admin API routes verify `role:'admin'`; UI stays behind `AdminOperations`. Device passwords are returned once and not written to RTDB. | `src/admin/*`, `src/app/api/admin/{owners,rooms,devices}/route.ts`, `src/server/admin-*`, `src/server/manage-*` |
| **Firmware rules draft** | Local ADR-0007 slice 02 rules allow `role:'device'` accounts with matching `propertyId`/`roomId` claims to write scoped `latest`, append own-room property-level `history`, and read scoped `devices` commands. Device command writes remain denied. Anonymous bench-room bridge is still present until cutover. | `database.rules.json`, `src/server/device-rules.integration.test.ts` |

**The one seam:** UI depends only on two ports — `AuthGateway` and `RoomDataSource` — never on the
Firebase SDK. Each has an in-memory **fake** (fast unit tests) and a real Firebase **adapter**
(emulator integration tests). Server workloads are pure `(deps, now) → effect` handlers with an
Admin-SDK adapter. Preserve this — it's why everything is testable.

## Architecture decisions (don't relitigate — see `docs/adr/`)

0001 rebuild-from-scratch · 0002 Next/TS · 0003 RTDB + immutable firmware contract · 0004 npm/vitest/
tailwind/shadcn · 0005 auth+tenancy via custom claims · 0006 server workloads · 0007 firmware
workstream · 0008 tariff engine (regime/band) · 0009 migrate to `ecostay-ems` Firebase project ·
0010 free runtime (Vercel + cron-job.org instead of Blaze Cloud Functions).

## Commands (gates — green before every commit)

```
npm test            # unit (fake-backed, fast)
npm run typecheck
npm run lint
npm run build
npm run test:integration   # emulator (needs Java 21 on PATH — see AGENTS.md env notes)
npm run seed        # bootstrap accounts + property/room/settings (Admin SDK, human-run)
node scripts/simulate-device.ts   # dev-only: write contract-exact telemetry (no ESP32 needed)
```

## Pending — human / ops (not code)

- **Live data won't populate history/cost/savings until a device is writing** `latest` (real ESP32 on
  the `ESP32`/`12345678` hotspot, or `scripts/simulate-device.ts`). Cron jobs already run; the sampler
  correctly skips stale data. First `rollup` run (00:05 Colombo or manual) fills cost/savings.
- **Rotate the Firebase service-account key** — it appeared in a chat transcript on 2026-07-07.
  Do not use the new device-account provisioning route against production until this is done.
- **Risk gate #8**: verify SSCL (2.5%) and any VAT on a **real EDL/CEB bill** before trusting cost totals;
  re-check CEB rates at the Q4 2026 PUCSL revision (the H-1/GP-1/D-1≤180 freeze rides on a subsidy
  ending Sep 2026).
- **RTDB rules**: `database.rules.json` is the canonical copy — republish in the Firebase console after
  any change. Latest local change is ADR-0007 slice 02 device-scoped rules; Codex did not publish it.

## What to build next (candidate phases)

1. **Admin Console** (`.scratch/admin-console/`) — COMPLETE (all four slices). Admin-only `/admin`
   route (`RequireAdmin` guard) with a three-view rail: **Settings** (tariff category + circuit
   wattages + alert thresholds — `src/admin/admin-settings.tsx`, port writes, tick reads
   per-property thresholds, admin-only rules); **Rooms** (`POST /api/admin/rooms/register` writes
   `ops/roomIndex` + property/room names — `src/admin/admin-rooms.tsx`); **Owners**
   (`GET/POST /api/admin/owners` create/disable/reset + assign-to-property via Admin SDK —
   `src/admin/admin-owners.tsx`, `src/server/admin-owners.ts`). All admin API routes verify the
   caller's `role:'admin'` claim (`src/server/admin-token.ts`); the `AdminOperations` port
   (`src/admin/admin-operations.ts`) keeps UI off `fetch`/Admin SDK. Owner role is hardcoded on
   create (no privilege escalation); non-owner targets are refused disable/reset. `ops/**`,
   `users/**`, `members` writes go through the Admin SDK — **no client rule changes for slices
   03-04**. **Human: re-publish `database.rules.json` after slice 02** (the `alertThresholds`
   rules) and **rotate the leaked service-account key** (the Owners route uses it in prod).
2. **Firmware workstream** (ADR-0007) — slices 00-02 are implemented locally. Slice 01 adds
   admin-only create/reset for Firebase Auth users with `role:'device'`, `propertyId`, and `roomId`
   claims; passwords are generated server-side, returned once, and never written to RTDB. Slice 02
   adds the matching local RTDB rules draft and emulator tests, but those rules are **not published**.
   Production use is blocked until the Firebase service-account key is rotated and a human republishes
   `database.rules.json`. Next slice: **03 firmware provisioning config draft** (risk gate #7,
   firmware/hardware approval before editing `firmware/complete.ino`).
3. **v1.1 queue** — FCM web push, TOU tariffs, multi-room switcher polish, savings/threshold refinements.

## How to continue (the framework)

This project runs on **vertical slices, test-first, with risk gates** (see AGENTS.md). For a new
feature: write/append a PRD under `.scratch/<feature>/PRD.md`, break it into `issues/NN-*.md`
(each a tracer bullet through all layers), then TDD one at a time. **Stop and get human approval at
risk gates** (auth, RTDB rules, device commands, data deletion, secrets, deploys, firmware,
money-facing math). The issue tracker is local markdown under `.scratch/`.

## Non-obvious gotchas

- **Money math must be eyeballed** — a savings pricing bug (LKR 3,415 vs 126) only showed on render.
- **Occupancy is on-device** — the dashboard displays `occupancyState`, never re-derives it.
- **Energy is simulated** by the firmware until real PZEM reads (ADR-0007) — always labelled "Simulated".
- **Cost/savings are monthly** — CEB regime is chosen by the whole month's kWh; never fake per-day rupees.
- **`ops/**`** is Admin-SDK-only internal state (room index, last-seen, open-alert index); no client rules.
- Deleting a temporary `src/app/preview` page needs a rebuild (stale Next route type otherwise).
