# 05 — Energy history charts on the room view

Status: ready-for-human (implemented 2026-07-04)
Slice: 5 of 7 · Parent: `.scratch/server-workloads/PRD.md`

> Implemented: port gains `subscribeEnergyHistory` (windowed, live) +
> `subscribeDailyAggregates`; Energy history section on the room view — 24 h power line
> (single series, thin marks, area fill, emphasized endpoint, per-point hover titles,
> Simulated badge) + 7-day kWh bars (missing days render as gaps, max day direct-labeled).
> Honest empty states before first sample / first rollup. Emulator-proven: owner reads
> windowed history + aggregates through the rules (client-side .indexOn works).
> 131 unit + 30 integration tests, all gates green.

## What to build

The Energy card grows a 24 h power/energy chart from raw samples and a 7-day kWh bar strip
from daily aggregates. Reads go through the RoomDataSource seam (new read methods + fake);
"Simulated" labeling carries over; empty states are honest ("no history yet — sampler runs
every 5 minutes"). Chart styling per the dataviz method (single-series, no legend, hover
tooltip, thin marks).

## Acceptance criteria

- [ ] 24 h chart renders from fake samples; updates when new samples arrive.
- [ ] 7-day bars from aggregates; day with no data shows a gap, not zero.
- [ ] Honest empty state before first sample; Simulated badge present.
- [ ] Port extension emulator-tested (owner can read history through rules).
- [ ] All gates green.

## Blocked by

- `01-energy-sampler.md` (data), `04-rollup-prune.md` (aggregates for the bars).
