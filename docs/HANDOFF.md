# HANDOFF — EcoStay EMS (state & where to continue)

_Last updated 2026-07-11. Read `AGENTS.md` for the operating rules; this file is "where are we, what's next"._

EcoStay EMS is a smart-IoT energy management system for Sri Lankan tourist accommodations:
an ESP32 per room writes telemetry to Firebase RTDB; a Next.js dashboard (Firebase Auth + RTDB)
gives owners live monitoring, control, cost, and savings. **The firmware is an immutable contract
(`docs/firmware-contract.md`); the dashboard adapts to it, never the reverse.**

## Status: v1 deployed AND a live device is reporting (2026-07-11)

Live at `https://ecostay-ems.vercel.app` (auto-deploys on push to `main`); `main` is pushed
through `aab3d73`. **The first real ESP32 is provisioned (NVS + Serial `SET_CONFIG`),
authenticated with its device account, and writing telemetry to production** — verified
2026-07-11 (`latest/updatedAt` seconds-fresh; known hardware nit: DHT11 reads 0 °C, check wiring).

Ops items CLOSED 2026-07-11: `database.rules.json` republished (incl. `acPowerThresholdW`),
the leaked service-account key rotated (old key deleted), FCM env vars set in Vercel.

Shipped since 2026-07-09 (all pushed): frontend audit + admin-console-v2 plan (`.scratch/`),
admin console Properties/rooms browse layer + sign-out, owner dashboard tabs
(Devices/Routines/Activity) + dead-control cleanup, `ac-left-on` alert + threshold,
admin-token 401/503 split, working FCM push (fixed members path, 500-token batching,
invalid-token pruning, env-injected service worker at `/firebase-messaging-sw.js`).

Also shipped 2026-07-11 (all pushed): **TOU tariffs live** (gate #8 signed off on rendered
money), **admin-console-v2 complete** (sub-routes, property detail with rooms/devices/owners/
settings inline, owner-access assign/remove writes — gate #1 approved), and the
**UI-architecture overhaul** (.scratch/ui-architecture-audit/): role-aware login landing,
owner-dashboard layout rebuilt (header overlap + hidden Alert Center fixed), subscription
error honesty, deep-linkable rooms/tabs, per-route titles, branded 404, one shared rail/badge
system, alerts + acknowledge inside the admin property detail, foreground-push toast.

Also: **fleet Overview** (v2 slice 09, `.scratch/admin-console-v2/issues/09-fleet-overview.md`):
`/admin` now lands on fleet health — rooms reporting (shared 15 s freshness rule) + open alerts
from `ops/openAlerts` — with the property registry moved to `/admin/properties`; rail is
Overview · Properties · Owners, and the admin rail collapses to a horizontal bar on phones
(same fix the owner rail got). Scope recorded as Admin use case 6 in `docs/use-cases.md`.

And 2026-07-12 (v2 slice 10, `.scratch/admin-console-v2/issues/10-fleet-alerts-devices.md`):
**fleet Alerts** (`/admin/alerts` — one AlertCenter per property, acknowledge in one place;
reuses the slice-08 path, no new writes) and **fleet Devices** (`/admin/devices` — read-only
registry of every room's device account + last report, composed from existing port calls;
credentials stay in property detail). Rail: Overview · Alerts · Properties · Devices · Owners.

Latest verification: **324 unit + 53 emulator tests green**, typecheck clean, 0 lint errors,
desktop + true-390px mobile screenshot-verified (CDP).

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
| **Admin Console** | Admin-only `/admin`: fleet **Overview** landing (rooms reporting + open alerts per property), **Properties** registry/detail (rooms, device credential create/reset, owners assign/remove, settings, alert center, per-room live links), **Owners**. Admin API routes verify `role:'admin'`; UI stays behind `AdminOperations`. Device passwords are returned once and not written to RTDB. | `src/admin/*`, `src/app/api/admin/{owners,rooms,devices,properties}/route.ts`, `src/server/admin-*`, `src/server/manage-*` |
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
   03-04**. DONE 2026-07-11: rules republished and the service-account key rotated. The
   **admin-console-v2** workstream (`.scratch/admin-console-v2/`) has since added the read side:
   Properties list (default view) + property detail with per-room device account/last-seen.
   Remaining v2 slices: sub-route chassis, inline forms, per-property owners, settings-in-detail.
2. **Firmware workstream** (ADR-0007) — slices 00-03 are implemented locally. Slice 01 adds
   admin-only create/reset for Firebase Auth users with `role:'device'`, `propertyId`, and `roomId`
   claims; passwords are generated server-side, returned once, and never written to RTDB. Slice 02
   adds the matching local RTDB rules draft and emulator tests, but those rules are **not published**.
   Slice 03 adds a Serial provisioning config block to the ESP32 to load `propertyId`, `roomId` and credentials dynamically from NVS instead of hardcoding.
   Slice 04 replaces anonymous Firebase sign-up with strict email/password auth for provisioned devices.
   UNBLOCKED 2026-07-11: key rotated, rules published, and a real device is live end-to-end
   (provisioned over Serial, email/password auth, scoped writes passing rules). Next slice:
   **05 firmware logic and hardware tuning** (also: DHT11 reads 0 °C on the bench device; the
   per-loop PZEM debug print floods Serial ~20×/s — rate-limit it in slice 05).
3. **v1.1 queue** — ~~FCM web push~~ (done 2026-07-11), **TOU tariffs** (in flight: engine +
   window split + tests green; H-2/H-3 kVA demand charges still unmodeled — those bills are
   understated; awaiting money eyeball), multi-room switcher polish, savings/threshold refinements.

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
