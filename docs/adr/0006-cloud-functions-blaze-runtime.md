# ADR-0006: Cloud Functions (Blaze) is the system's only always-on runtime

Date: 2026-07-04 · Status: Accepted (Phase 1 grilling)

## Context
The firmware writes only a 3-second `latest` snapshot (plus water-gated history) — no energy
time-series, no alert records, no automation beyond the local gas override. Charts, alerts,
savings analysis, and the vacancy-cutoff automation all need logic that runs when no browser
is open. The previous build ran automation client-side — it died with the tab (rejected).

## Decision
All background logic runs in **Firebase Cloud Functions** on the **Blaze plan** (required
for scheduled functions). Five workloads:

1. **5-min energy sampler** → `energyHistory` samples `{energy, power, occupancyState, sampledAt}`;
   cumulative-kWh sampling with reboot detection via negative deltas.
2. **Nightly rollup** → per-room daily aggregates `{kWhUsed, costLKR, occupiedMinutes}` (kept
   forever) + pruning of raw samples older than 90 days.
3. **1-min offline detector** → device-offline alerts at ~90 s staleness.
4. **Alert evaluator** — RTDB trigger on `latest` writes: gas/temperature/water thresholds
   (Admin-editable), alert lifecycle open → auto-resolve → acknowledge, no duplicates.
5. **Automation executor** — RTDB trigger on `occupancyState` transitions: Vacancy Cutoff
   with transition-epoch precedence (manual commands after the transition stand until the next one).

## Consequences
- Blaze = a billed project: every deploy is human-run or human-approved (AGENTS.md risk gate).
  Projected load (~9k sampler invocations/month) is far inside the 2M free tier — cost ≈ 0,
  but the safeguard stands.
- The browser client renders and commands; it never records history or runs automation.
- Functions code lives in this repo (workspace TBD at first Functions issue) and follows the
  same TDD discipline.
