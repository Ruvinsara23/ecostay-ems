# 04 — Nightly rollup + 90-day prune (risk gate #4)

Status: ready-for-agent
Slice: 4 of 7 · Parent: `.scratch/server-workloads/PRD.md`

## What to build

`/api/cron/rollup` (daily, Asia/Colombo): `rollupDaily(deps, dateKey)` computes per room
`properties/{pid}/dailyAggregates/{rid}/{yyyy-mm-dd}` = `{kWhUsed, costLKR: null,
occupiedMinutes}` from the day's samples (kWh from cumulative deltas with negative-delta
reboot handling; occupiedMinutes from sampled occupancy × 5 min). Prune: raw samples older
than 90 days — **ships dry-run only** (`?confirm=` absent → report what WOULD be deleted);
the human reviews a dry-run report and approves the deletion window before live pruning is
enabled (risk gate #4).

## Acceptance criteria

- [ ] kWh correct across a reboot (negative delta treated as new baseline, not negative use).
- [ ] occupiedMinutes from the Occupied predicate over samples.
- [ ] Rollup idempotent for a date (re-run overwrites, never doubles).
- [ ] Prune dry-run reports counts/window and deletes nothing; live mode gated on human approval.
- [ ] Emulator-proven; all gates green.

## Blocked by

- `01-energy-sampler.md` (needs samples to aggregate).
