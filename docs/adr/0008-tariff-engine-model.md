# ADR-0008: Tariff engine models regime/band selection, not simple slabs

Date: 2026-07-04 · Status: Accepted (supersedes the block model sketched in Phase 1 grilling)

## Context
Phase 1 grilling accepted a per-property tariff as an ordered array of incremental slabs
`{upToKWh, ratePerKWh}[]` plus a single `fixedChargeLKR` (CONTEXT.md, "CEB tariff" decision).
The follow-up research task (`docs/research/ceb-tariff-schedule.md`, sourced to the PUCSL
"Decision on Electricity Tariffs, Effective from May 11, 2026" and cross-checked against LECO's
official bill-calculator constants) showed that model is **wrong for two of the three categories a
tourist accommodation actually uses**:

- **GP-1** (commercial catch-all) and **H-1** (SLTDA-approved hotels) are *volume-differentiated
  band switches*: the month's total consumption selects a band, and that band's **single rate
  applies to every kWh** — not an incremental slab. Encoding the bands as slabs undercharges every
  month above the threshold. The bill has a discontinuity, e.g. H-1 300 kWh → LKR 3,000 but
  301 kWh → LKR 6,218.
- **Domestic (D-1)** selects one of three *regimes* by monthly total (≤60 / 61–180 / >180); only
  inside a regime are the blocks true incremental slabs. Its **fixed charge varies by the block the
  total lands in** (regime B: 400 / 1,000 / 1,500), which one per-tariff `fixedChargeLKR` cannot
  represent.
- LECO's calculator applies a **2.5% SSCL gross-up** (`bill ÷ 97.5 × 2.5`) with no VAT line; the
  original model had nowhere to put it.

The tariff engine is on the critical path for cost tracking (OBJ) and for pricing the savings
counterfactual, so the model must be right before the calculator is written (TDD).

## Decision
The tariff is a **regime/band engine**, per-property, Admin-editable:

```
Tariff = { category, sscl, regimes: Regime[] }   // regimes ordered by upToKWh asc; top regime upToKWh: null
Regime = { upToKWh, method: "flat" | "slab", blocks: Block[] }
Block  = { upToKWh, ratePerKWh, fixedChargeLKR }  // fixed charge = the block the monthly total lands in
```

Computation for a monthly total `T`:
1. Select the first regime with `upToKWh >= T` (null = unbounded top regime).
2. Within it, find the block with `upToKWh >= T` — its `fixedChargeLKR` is the month's fixed charge.
3. Energy charge: `method: "flat"` → `T × block.ratePerKWh` (band rate on all units);
   `method: "slab"` → incremental sum of each block's rate over its kWh range up to `T`.
4. Final bill: `(energyCharge + fixedCharge) × (1 + sscl)`.

A flat single-rate tariff is one regime with one `flat` block. Seed configs for D-1 / GP-1 / H-1
come from the research note. TOU (D-TOU, H-2/H-3) and per-kVA demand charges are **out of this
model** and deferred to v1.1; 30-day proration of block boundaries is a v1 approximation (assume a
30-day cycle) flagged in the UI.

## Consequences
- The calculator is written test-first against worked examples from the research note, including the
  band-switch discontinuities (the exact bug the slab model would have hidden).
- `sscl` and per-block `fixedChargeLKR` are first-class config fields; the Admin tariff UI edits the
  regime/block tree, not a flat slab list.
- **Rates are not trusted blindly**: (1) SSCL and any VAT on real EDL (ex-CEB) bills is unverified —
  confirm on the pilot property's actual bill before shipping cost figures; (2) the D-1 ≤180 / GP-1 /
  H-1 freeze rides on a subsidy ending Sep 2026 — re-check at the Q4 2026 PUCSL revision. Both are
  tracked in CONTEXT.md "Remaining open items".
- Category is seeded from the category printed on the owner's bill, not inferred from business type
  (the D-1 vs GP-1 vs H-1 choice can swing the bill ~4×; see the research note's applicability
  section).
- This ADR revises the tariff shape only; the "per-property, Admin-editable, no auto-fetch, TOU in
  v1.1" decisions from grilling stand.
