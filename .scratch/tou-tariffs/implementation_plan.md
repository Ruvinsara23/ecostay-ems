# Goal Description

Implement **Time of Use (TOU)** tariffs as part of the v1.1 queue. CEB TOU tariffs apply different flat rates for electricity consumed during Peak (18:30–22:30), Day (05:30–18:30), and Off-peak (22:30–05:30) windows. We need to expand the server's daily rollup to bucket energy usage into these windows, update the tariff engine to compute bills using these buckets, and expose the new TOU tariff options (D-TOU, H-2, H-3) in the admin settings.

## User Review Required

- **Avoided Energy Bucketing**: To accurately price savings on a TOU tariff, the counterfactual "avoided energy" (when the AC is cut off) also needs to be bucketed into Peak, Day, and Off-Peak. I'll update the `DailyAggregate` to store `kWhUsedPeak`, `kWhUsedDay`, `kWhUsedOffPeak` as well as `avoidedKWhPeak`, `avoidedKWhDay`, `avoidedKWhOffPeak`.
- **Demand Charges**: As per the research notes, TOU categories like H-2 and H-3 carry a per-kVA demand charge. I am intentionally ignoring demand charges in this v1.1 slice to focus entirely on the energy (kWh) billing, as the dashboard does not yet track or compute maximum demand (kVA).

## Proposed Changes

---

### Tariff Schema & Data

#### [MODIFY] [tariff.ts](file:///c:/Users/pansi/Projects/ecostay-ems/src/tariff/tariff.ts)
- Add a new `TariffTouRates` type: `{ peak: number; day: number; offPeak: number; fixedChargeLKR: number }`.
- Update `Tariff` type to optionally include `isTOU?: boolean`, `touRates?: TariffTouRates` alongside the existing `regimes?: TariffRegime[]` to avoid breaking existing flat/slab logic.

#### [MODIFY] [ceb-tariffs.ts](file:///c:/Users/pansi/Projects/ecostay-ems/src/tariff/ceb-tariffs.ts)
- Introduce `CEB_D_TOU`, `CEB_H2`, and `CEB_H3` using the rates recorded in the `ceb-tariff-schedule.md` research. Add these to the `CEB_TARIFFS` export so they become available in the Admin Settings dropdown.

---

### Time & Server Workloads

#### [MODIFY] [colombo-time.ts](file:///c:/Users/pansi/Projects/ecostay-ems/src/server/colombo-time.ts)
- Implement `colomboTouWindow(ms: number): 'peak' | 'day' | 'offPeak'` that translates a UTC timestamp into the Colombo time window.

#### [MODIFY] [rollup.ts](file:///c:/Users/pansi/Projects/ecostay-ems/src/server/rollup.ts)
- Update `DailyAggregate` type to include optional TOU buckets: `kWhUsedPeak`, `kWhUsedDay`, `kWhUsedOffPeak`, and matching `avoidedKWh*` buckets.
- In `rollupDaily`, as we calculate the `delta` between 5-minute samples, run the timestamp through `colomboTouWindow` and add the `delta` to the appropriate `kWhUsed` bucket. Do the same for the calculated `avoidedKWh`.

---

### Billing & UI

#### [MODIFY] [compute-bill.ts](file:///c:/Users/pansi/Projects/ecostay-ems/src/tariff/compute-bill.ts)
- Update `computeBill` signature to accept an optional `monthlyTou` and `monthlyAvoidedTou` breakdown.
- If `tariff.isTOU` is set, multiply the peak/day/off-peak totals by their respective rates instead of traversing standard regimes.
- Update `marginalRatePerKWh` to accept a `nowMs` argument to return the active rate at the time of query if the property is on a TOU tariff.

#### [MODIFY] [month-to-date.ts](file:///c:/Users/pansi/Projects/ecostay-ems/src/tariff/month-to-date.ts)
- Add `monthToDateTouKWh` and `monthToDateAvoidedTouKWh` to sum the new DailyAggregate buckets over the current month.

#### [MODIFY] [savings.ts](file:///c:/Users/pansi/Projects/ecostay-ems/src/tariff/savings.ts)
- Update `savedLKR` to accept the avoided energy TOU breakdown and price it using the `touRates` when the property is on a TOU tariff.

#### [MODIFY] [energy-charts.tsx](file:///c:/Users/pansi/Projects/ecostay-ems/src/rooms/energy-charts.tsx)
- Feed the TOU sum breakdowns into `computeBill` and `savedLKR` when rendering the "Estimated bill this month" and "Saved this month" cards.

---

## Verification Plan

### Automated Tests
- `npm test src/tariff` - Verify TOU bill math and avoided cost logic against `ceb-tariffs.ts`.
- `npm test src/server/rollup.test.ts` - Ensure that mocked energy samples correctly fall into and accumulate within the expected TOU buckets.
- `npm run typecheck` - Verify strict TS compliance across the expanded `Tariff` and `DailyAggregate` shapes.
