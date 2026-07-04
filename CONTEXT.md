# CONTEXT.md — EcoStay EMS

> Ubiquitous language for the project. Every term is tagged:
> **existing** (in the firmware contract — immovable), **derived** (computed from existing data),
> **accepted** (stabilized by the Phase 1 grilling interview, 2026-07-04),
> **proposed** (candidate, not yet stabilized by interview), **rejected** (decided against — do not reintroduce).
>
> Phase 1 grilling (2026-07-04) updated this file. Code may only use **existing**, **derived**,
> and **accepted** terms; a **proposed** term appearing in code is a defect.

## Project

**EcoStay EMS** — Smart IoT-based energy management system for tourist accommodations in Sri Lanka.
An ESP32 node per room senses occupancy/environment and drives relays; a Next.js dashboard
(Firebase RTDB + Auth) gives owners live monitoring, cost tracking (CEB tariffs), and manual control.
Rebuilt from scratch 2026-07 — the only artifact kept from the previous build is `firmware/complete.ino`.

**Ambition (grilled 2026-07-04): a fully functional production-grade system, not a demo-only capstone.**
A working hardware prototype (new PCB in design) must be live at the evaluation. A data seeder that
fakes firmware writes exists for development and rehearsal only — it is a dev tool, never the demo.

## Actors

| Term | Status | Meaning |
|---|---|---|
| Owner | accepted | Accommodation owner/manager. Monitors, controls devices, views costs and alerts — for **their assigned properties only** (see Tenancy). |
| Admin | accepted | Operator role. Everything Owner can do, plus: owner-account management (create/disable/reset/role), tariff settings, property/room metadata, room+device registration, alert thresholds, circuit wattages. Sees all properties. |
| Guest | accepted | Room occupant. Never uses the dashboard; interacts only physically (door, motion, appliances). |
| Device / Node | existing | The ESP32 in a room. Authenticates **anonymously today**; moves to per-device credentials via the firmware workstream (see Device identity). |
| Staff (third role) | rejected | No concrete capability separates it from Owner/Admin in v1. |

## Auth & tenancy (accepted)

- Roles enforced via **Firebase custom claims** (`role: admin | owner | device`), set by the
  **Firebase Admin SDK behind Next API routes**. First admin bootstrapped by a one-off seed script.
- Account management lives in the Admin UI (create owner, disable/enable, reset password, change role).
- **Tenancy**: `properties/{pid}/members/{uid}: "owner"` is the authority RTDB rules check;
  a mirrored index `users/{uid}/properties/{pid}: true` gives owners a one-read property list.
  Both are written atomically by the Admin API route. Admins bypass membership via role claim.
- **Device identity**: per-device email/password credentials created when Admin registers a room
  (device ↔ room is 1:1), with a `role=device` claim scoped to that room's paths. Anonymous
  sign-in is **disabled project-wide once provisioned firmware ships**; until then a transitional
  ruleset tolerates anonymous writes to `property_001/room_001` only, and is deleted at cutover.

## Core entities & identity

| Term | Status | Meaning |
|---|---|---|
| Property | existing | Top-level unit: `properties/{propertyId}`. Firmware hardcodes `property_001` **today**; the provisioning workstream makes device IDs configurable. Dashboard is multi-property from day one. |
| Room | existing | `properties/{propertyId}/rooms/{roomId}`. Firmware hardcodes `room_001` **today**. Rooms are created/named via the Admin UI; the bench node registers as the first room until PCB units arrive. |
| `latest` | existing | Per-room telemetry snapshot, overwritten every 3 s by firmware. Not a history. |
| `history` | existing | Per-property append log — **written by firmware only when water flows**; carries NO energy fields. |
| `devices/*` | existing | Per-room command booleans the firmware polls every 500 ms: `exhaustFan`, `motionDetection`, `lights`, `waterPump`, `mainRelay` (read but unused by firmware — no rule or UI may target it until the firmware workstream wires it). |

### Dashboard-owned paths (accepted — never written by firmware)

| Term | Status | Meaning |
|---|---|---|
| `energyHistory` | accepted | `properties/{pid}/rooms/{rid}/energyHistory` — 5-min samples `{energy, power, occupancyState, sampledAt}` written by the scheduled Cloud Function. Cumulative-kWh sampling; reboot resets detected as negative deltas. Raw retention 90 days, then pruned. |
| Daily aggregates | accepted | Per room per day `{kWhUsed, costLKR, occupiedMinutes}` written by the nightly rollup Function; kept forever. Weekly/monthly views compute from dailies. |
| `alerts` | accepted | `properties/{pid}/alerts` — lifecycle records `{roomId, type, severity, value, startedAt, resolvedAt, acknowledgedBy, acknowledgedAt}`. |
| `automationLog` | accepted | Every automation action: room, relays cut, occupancy transition timestamps. Feeds the savings computation. |
| Tariff settings | accepted | Per-property, Admin-editable (see Tariff). |
| `members` / `users` index | accepted | Tenancy records (see Auth & tenancy). |

## Telemetry vocabulary (all **existing** — field names are fixed by firmware)

`voltage`, `current`, `power`, `energy` (⚠️ all four **simulated** by firmware today — sine wave, not real PZEM;
real PZEM-004T reads are in the approved firmware workstream — until they land, every energy value in the UI
carries a "simulated" label per ADR-0003),
`gas` (int 0–1000, alarm > 300), `pir`, `doorOpen`, `temperature`, `humidity`,
`lightLevel` (always 0 — no sensor), `waterLevel` (0–100 %), `flowRate` (L/min),
`totalLiters` (resets on device reboot), `relayStatus` (presence relay only), `buzzerStatus`,
`occupancyState`, `humanPresent`, `motionDetected`, `updatedAt` (server timestamp).

## Occupancy states (existing — produced ON-DEVICE; dashboard displays, never re-derives)

`VACANT`, `ENTRY_DETECTED`, `OCCUPIED_ACTIVE`, `OCCUPIED_IDLE`, `OCCUPIED_SLEEPING`,
`EXIT_PENDING`, `VACANT_CONFIRMED`.
Timeouts on device: 10 s (active→idle; entry→vacant-confirmed), 30 s (idle→sleeping; exit→vacant-confirmed).

## Derived terms (computed by dashboard/Functions — never stored back into `latest`)

| Term | Status | Meaning |
|---|---|---|
| Occupied (boolean) | derived | `occupancyState ∈ {ENTRY_DETECTED, OCCUPIED_ACTIVE, OCCUPIED_IDLE, OCCUPIED_SLEEPING, EXIT_PENDING}` — same predicate as firmware's `isOccupiedState()`. |
| Energy cost | derived | Block tariff engine over kWh: ordered `{upToKWh, ratePerKWh}[]` + `fixedChargeLKR` (a flat tariff is one block). Currency: LKR. **Rates pending a research task with a current CEB citation before the calculator is implemented.** |
| Savings | derived | **Headline: counterfactual avoided energy** — Σ(rated wattage of each cut circuit × time it stayed cut), from `automationLog` × Admin-configured circuit wattages, priced via the tariff engine. **Secondary: kWh per occupied-hour** trend from daily aggregates. |
| Device online | derived | UI: offline when `now − updatedAt > 15 s` (5 missed write cycles), computed against `.info/serverTimeOffset`. Offline **alert** raised at ~90 s staleness by the 1-min scheduled Function. Offline UI: values grey out with "last seen", **device controls disabled** (no queued commands). |

## Server runtime (accepted)

**Firebase Cloud Functions on the Blaze plan** is the system's only always-on runtime:

1. 5-min scheduled energy sampler → `energyHistory`
2. Nightly rollup → daily aggregates + 90-day raw pruning
3. 1-min scheduled offline detector → offline alerts
4. RTDB trigger on `latest` writes → alert evaluator (gas/temp/water thresholds)
5. RTDB trigger on `occupancyState` transitions → automation executor

Workload sits orders of magnitude inside the free allowance (~9k sampler invocations/month vs 2M free).
No background logic ever runs in the browser client.

## Automation (accepted)

- v1 rule: **Vacancy Cutoff** — on `VACANT_CONFIRMED`, write the room's configured subset of
  `devices/*` to false (default: `lights`, `exhaustFan`). Per-room master automation on/off
  toggle, visible to the Owner.
- **Transition-epoch precedence**: automation acts only *at the moment* of an occupancy
  transition; any manual command issued after that moment stands until the next transition.
  No sticky override flags, no timers.
- The firmware's local gas→exhaust-fan override always wins locally; cloud automation never fights it.
- v1.1 queue: "welcome lights on entry", temperature-based fan rules.

## Alerts (accepted)

- Server-detected only: gas > 300, temperature > threshold, water level < threshold
  (RTDB trigger), device offline (scheduled). Thresholds are Admin-editable settings.
- Persisted with lifecycle: open → auto-resolve when the condition clears; Owner acknowledge;
  no duplicate alert while one of the same type/room is open.
- Channel: in-app live alert center in v1. **FCM web push in v1.1.** Email rejected.

## Tariff (accepted)

- Per-property, Admin-editable: category label + ordered blocks `{upToKWh, ratePerKWh}[]`
  + `fixedChargeLKR`. Covers CEB Domestic slabs and GP/Hotel flat schedules in one structure.
- Update path: Admin edits when CEB gazettes a revision. No auto-fetching.
- Time-of-use (peak/day/off-peak) deferred to v1.1 — 5-min samples can support it later.
- Seed values come from the researched current CEB schedule, cited in the repo.

## Firmware workstream (approved 2026-07-04 — separate ADR; coordinates with the PCB design)

1. **Provisioning**: property/room IDs configurable per device (no more hardcoded `property_001`/`room_001`).
2. **Per-device credentials**: email/password identity + `role=device` claim; anonymous auth disabled at cutover.
3. **Real PZEM-004T reads** replacing `updatePzemDummyReading()`.

The contract's data shapes, field names, paths layout, and cadence remain unchanged — the
workstream changes identity and data *authenticity*, not the contract shape.

## Rejected

| Term | Why |
|---|---|
| Client-side occupancy state machine | Duplicate of the on-device one — two sources of truth diverge. Dashboard displays `occupancyState`; it never re-derives it. |
| REST API layer (`/api` backend server) | Previous build had a phantom `localhost:5000/api` layer feeding nothing. Dashboard talks to Firebase RTDB directly; the only server surface is Next API routes for Admin SDK operations. |
| Client-side automation / client history recorder | Dies with the tab. Confirmed final in grilling — all background logic runs in Cloud Functions. |
| Staff role | No concrete capability vs Owner/Admin in v1. |
| Baseline-period comparison as primary savings metric | Occupancy differences between periods contaminate the number; usable in the written report only. |
| Email alert channel | Third-party SMTP dependency for less value than FCM push. |
| Queued device commands while offline | A command landing whenever the device reconnects flips relays unpredictably in guest rooms. |
| All-owners-see-all-properties | Not tenancy; owners see only assigned properties. |
| Guest-facing UI, bookings/reservations, guest billing/invoicing, native mobile app | Out of scope for v1 (grilled 2026-07-04). Responsive web + FCM push covers mobile. UI ships English-only in v1. |

## Decision log (Phase 1 grilling, 2026-07-04)

All eight open questions answered; decisions recorded in the sections above:

1. **Roles** → Owner + Admin, custom claims via Admin SDK API routes (Auth & tenancy).
2. **Energy history** → Cloud Functions on Blaze, 5-min sampler, two-tier retention (Server runtime).
3. **Alerts** → persisted lifecycle, server-detected, in-app v1 / FCM v1.1 (Alerts).
4. **CEB tariff** → per-property block model, TOU deferred (Tariff).
5. **Savings** → counterfactual avoided energy + kWh/occupied-hour (Derived terms).
6. **Offline** → 15 s UI / 90 s alert / controls disabled (Derived terms).
7. **Override semantics** → transition-epoch precedence (Automation).
8. **Scope** → guest UI, bookings, guest billing, native app all out (Rejected).

### Remaining open items

1. **CEB tariff rates research** — current gazetted schedule with citation, before the cost calculator is implemented.
2. **Circuit rated wattages** — Admin enters per controlled circuit per room at setup (needed for savings).
3. ~~ADRs to draft~~ — done 2026-07-04: ADR-0005 (auth & tenancy), ADR-0006 (Cloud Functions/Blaze), ADR-0007 (firmware workstream, amends ADR-0003).
4. ~~AGENTS.md missing~~ — recreated 2026-07-04 with commands verified against the running app.
5. **v1.1 queue**: FCM web push, TOU tariffs, entry-restore automation rule.
