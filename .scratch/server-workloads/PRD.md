# PRD: Server workloads on the free runtime — history, alerts, automation

Status: ready-for-agent (architecture decided: ADR-0010; slices below)
Feature slug: server-workloads
Created: 2026-07-04
Phase: 5

> The system's always-on brain, on the free runtime (ADR-0010: Vercel + cron-job.org).
> Five workloads from the grilled architecture (ADR-0006 semantics, new trigger wiring):
> energy sampler, offline detector, alert evaluator, vacancy-cutoff automation, nightly
> rollup — plus the UI that makes them visible: history charts and an alert center.

## Problem Statement

The dashboard shows only the present. The firmware writes no energy history, so there are no
charts, no daily costs, no savings story (OBJ-07). Nothing detects a dead device or a gas
spike when no browser is open, and lights burn in vacant rooms unless the Owner notices.

## Solution

Three cron-driven endpoints (secret-protected, Admin SDK) record 5-minute energy samples,
watch every room each minute (offline + threshold alerts with a full open→resolve lifecycle,
and vacancy cutoff automation with an action log), and roll up daily kWh/cost/occupancy
aggregates each night. The room view gains an energy history chart and daily figures; an
alert center lists open and past alerts with acknowledge. Costs stay "LKR —" until the
tariff engine phase; savings math consumes `automationLog` later.

## User Stories (abridged — semantics were grilled and are recorded in CONTEXT.md)

1. As an Owner, I want an energy chart for today/this week, so that consumption is visible over time.
2. As an Owner, I want daily kWh totals per room, so that I can compare days at a glance.
3. As an Owner, I want an alert when my device goes silent (~90 s), so that outages don't hide.
4. As an Owner, I want gas/temperature/water-level alerts recorded with times, so that incidents have a history even when I wasn't watching.
5. As an Owner, I want to acknowledge an alert and see it auto-resolve when the condition clears, so that the list reflects reality.
6. As an Owner, I want lights/fan cut automatically when the room is confirmed vacant (if I enable automation), so that empty rooms stop burning energy.
7. As an Owner, I want a per-room automation on/off toggle, so that I stay in control.
8. As an Owner, I want my manual command after a transition to stand until the next transition (epoch precedence), so that automation never fights me.
9. As the system, I want every automation action logged, so that savings can be computed later (OBJ-07).
10. As the system, I want raw samples pruned at 90 days but daily aggregates kept forever (retention decision), with the prune reviewed by a human before it ever runs (risk gate #4).

## Implementation Decisions

- **Runtime**: ADR-0010. Handlers are pure `(deps, nowMs) → Promise<Report>` functions in
  `src/server/` (unit-tested with in-memory deps; emulator-tested against RTDB); API routes
  are thin auth+wiring shells. Node runtime (firebase-admin), never edge.
- **Paths** (all CONTEXT.md-accepted; written only by Admin SDK):
  `properties/{pid}/rooms/{rid}/energyHistory/{pushId}` = `{energy, power, occupancyState, sampledAt}`;
  `properties/{pid}/rooms/{rid}/dailyAggregates/{yyyy-mm-dd}` = `{kWhUsed, costLKR|null, occupiedMinutes}`;
  `properties/{pid}/alerts/{pushId}` = lifecycle record per CONTEXT.md;
  `properties/{pid}/automationLog/{pushId}`;
  `properties/{pid}/rooms/{rid}/settings/automationEnabled` (owner-writable — needs one rules
  addition, risk gate #2);
  `ops/**` internal last-seen state, Admin-only, no client rules.
- **Alert semantics**: defaults gas > 300 (contract), temperature > 33 °C, waterLevel < 20 %
  (defaults constants for now; Admin-editable settings arrive with the Admin UI phase).
  Dedupe: one open alert per (room, type); auto-resolve when clear; `acknowledgedBy/At` set
  from the dashboard (owner write to just those two fields — rules addition with validation).
- **Automation**: on each tick, compare each room's `occupancyState` to `ops` last-seen; on a
  transition INTO `VACANT_CONFIRMED` with automation enabled → write `lights=false`,
  `exhaustFan=false` (configured subset later), append `automationLog`. Never `mainRelay`.
  Epoch precedence falls out of transition-only action.
- **Charts**: energy history line/area for 24 h from raw samples; daily bars from aggregates.
  Rendered from a `ChartData` port fed by the existing RoomDataSource seam (extended reads).
- **Deployment (human-run)**: Vercel Hobby project + env (`FIREBASE_SERVICE_ACCOUNT`,
  `CRON_SECRET`, `NEXT_PUBLIC_*`); cron-job.org account with 3 jobs incl. the bearer header.
  A runbook doc ships in the repo.

## Testing Decisions

Pure handlers unit-tested (clock injected; in-memory fake for the RTDB surface the handlers
use); emulator integration for each endpoint's full path (auth rejection without secret,
sample lands, alert opens/dedupes/resolves, automation writes + log, rollup + prune windows);
UI (charts, alert center) tested through the existing port/fake pattern. Prior art: all
existing suites. Prune logic ships behind an explicit dry-run flag until the human approves
its deletion window (risk gate #4).

## Out of Scope

- Tariff engine + LKR costs (next phase; `costLKR: null` until then), savings math (needs
  wattage config), FCM push, Admin settings UI, TOU, charts beyond room-level day/week.

## Further Notes

Slices: 01 sampler, 02 tick (offline+alerts), 03 automation, 04 rollup+prune, 05 charts UI,
06 alert center UI, 07 deployment runbook + live cron verification.
