# 05 — Energy history charts on the room view

Status: ready-for-agent
Slice: 5 of 7 · Parent: `.scratch/server-workloads/PRD.md`

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
