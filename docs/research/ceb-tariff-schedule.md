# CEB Electricity Tariff Schedule — Sri Lanka (research snapshot)

- **Research date (all sources retrieved):** 2026-07-04
- **Currently effective revision:** PUCSL **"Decision on Electricity Tariffs, Effective from May 11, 2026"**
  — an *extraordinary tariff review* decided 2026-05-09, covering the costs of April–September 2026
  (2026 Q2 + Q3). Applies to **both EDL (ex-CEB) and LECO** consumers and remains in force
  *"until next tariff revision"* (decision, p. 4).
- **Previous revision:** "Decision on Electricity Tariffs, Effective from April 01, 2026" (Q2 decision,
  issued 2026-03-30). The 11-May revision raised overall tariffs by **18.10%**, but a
  **LKR 15 bn government subsidy** was absorbed so that rates are **unchanged** for: Domestic ≤180 kWh/month,
  Religious ≤180 kWh/month, **GP-1**, **H-1**, and I-1 (decision §7). Increases landed on Domestic >180,
  D-TOU, GP-2/3, H-2/3, I-2/3, all Government, and street lighting.
- **Verified as latest:** PUCSL's End User Tariff Decisions index lists "2026 May" as the most recent
  decision as of 2026-07-04. No revision took effect 1 July 2026.

## Sources

| # | Document | URL | Notes |
|---|----------|-----|-------|
| S1 | PUCSL, *Decision on Electricity Tariffs, Effective from May 11, 2026* (PDF, 14 pp; rates read from Annex 2 "Tariff Table for a 30 Day Billing Cycle") | <https://www.pucsl.gov.lk/wp-content/uploads/2026/05/Full-Final_Decision-on-Electricity-Tariffs-May-2026.pdf> | **Primary. All rates below come from this document** unless noted. Retrieved 2026-07-04. |
| S2 | PUCSL announcement, *Electricity Tariff Revision – 2026 May* | <https://www.pucsl.gov.lk/electricity-tariff-revision-2026-may/> | Decision dated 2026-05-09. |
| S3 | PUCSL, *End User Tariff Decisions* index | <https://www.pucsl.gov.lk/end-user-tariff-decisions/> | Revision history; confirms May 2026 is latest. |
| S4 | PUCSL, *Electricity Tariff Revision – 2026 Q2* | <https://www.pucsl.gov.lk/electricity-tariff-revision-2026-q2/> | April 1, 2026 revision (superseded 11 May 2026). |
| S5 | CEB, *Guideline: Determination of Tariff Category* (PDF, 5 pp) | <https://www.ceb.lk/front_img/17436124842.2_.-Annex-I-The-Guidelines-for-determination-of-tariff-category_.pdf> | **Primary for category applicability.** Undated on its face; hosted on ceb.lk. |
| S6 | PUCSL, *Tariff – Hotels* page | <https://www.pucsl.gov.lk/electricity/tariff/hotels/> | Used **only** for the Hotel category definition. ⚠️ Rates on this page are stale (an older revision) — do not use. |
| S7 | LECO, official *Monthly Bill Calculator* + its calculation script | <https://www.leco.lk/revisedbillCal_e.php>, <https://www.leco.lk/js/revisedcal14.js?v=1.1> | Licensee-official. Script already carries the 11-May-2026 rates; used to **verify billing semantics** (band switching vs slabs, fixed-charge selection, proration, SSCL). |
| S8 | PUCSL, *Bulk Supply Tariff Submission for 2026 Quarter 3* | <https://www.pucsl.gov.lk/bst-submission-for-2026-quarter-3/> | Pending Q3 filing (see "Pending revisions"). |
| S9 | CEB, *tariff_catergory* page | <https://www.ceb.lk/tariff_catergory> | ⚠️ Severely outdated (2014 rates). Cited only to note it must not be used. |

Revision history (S3): 2008, 2009, 2011, 2013, 2014, 2022 (Aug), 2023 Feb, 2023 Jul, 2023 Oct,
2024 Mar, 2024 Jul, 2025 Jan, 2025 Jun, 2025 Oct, **2026 Apr, 2026 May (current)**.

---

## How CEB/LECO tariffs are actually applied (billing semantics)

These rules are essential before mapping anything into the project's block model. Verified against
the Annex 2 table structure (S1) and LECO's official calculator logic (S7):

1. **Two different mechanisms exist:**
   - **Volume-differentiated band switching** (GP-1, H-1, I-1, GV-1): total monthly consumption
     selects a band, and **the band's single rate applies to ALL kWh consumed**, together with that
     band's fixed charge. It is *not* an incremental slab. (LECO script: `CalMethod = 1`,
     "flat rate calculation method" — `charge = rate[band] × totalUnits`.)
   - **Regime-selected incremental blocks** (Domestic, Religious): total monthly consumption first
     selects a *regime* (D-1: ≤60 / 61–180 / >180); within the regime, blocks are **incremental
     slabs** (LECO script: `CalMethod = 2`). The **fixed charge is the one attached to the block
     band in which total consumption falls** (not additive per block).
2. **30-day proration:** the table is defined "for a 30 Day Billing Cycle"; block/band boundaries are
   prorated by actual billing days (`boundary × days/30`) (S1 table title; S7 implements it).
3. **SSCL:** LECO's calculator adds a Social Security Contribution Levy gross-up on the final bill:
   `SSCL = bill ÷ 97.5 × 2.5` (≈ 2.564% of the pre-levy bill). No VAT line is applied in the
   calculator. *(SSCL confirmed licensee-official for LECO; verify appearance on an actual EDL/CEB
   bill — see Confidence & gaps.)*

---

## Domestic (D-1) — effective 11 May 2026 (S1, Annex 2)

Definition: "supply of electricity used for domestic purposes in private residences" (S5).
The ≤60 vs >60 regime split **still exists**, and the 11-May revision added a **third regime for
consumers above 180 kWh/month** (this was the restructure that delivered the +18% to that group;
previously the 61+ regime simply had a fifth block: >180 kWh @ 85.00, fixed 2,100).

### Official table

**Regime A — total consumption 0–60 kWh/month:**

| Block | Energy (LKR/kWh) | Fixed (LKR/month, if total falls in this band) |
|---|---|---|
| 0–30 kWh | 5.00 | 80.00 |
| 31–60 kWh | 9.00 | 210.00 |

**Regime B — total consumption above 60 and up to 180 kWh/month** (blocks incremental from unit 1):

| Block | Energy (LKR/kWh) | Fixed (LKR/month, if total falls in this band) |
|---|---|---|
| 0–60 kWh | 14.00 | – |
| 61–90 kWh | 20.00 | 400.00 |
| 91–120 kWh | 28.00 | 1,000.00 |
| 121–180 kWh | 44.00 | 1,500.00 |

**Regime C — total consumption above 180 kWh/month** (new structure, 11 May 2026):

| Block | Energy (LKR/kWh) | Fixed (LKR/month) |
|---|---|---|
| 0–180 kWh | 32.50 | – |
| Above 180 kWh | 100.00 | 2,500.00 |

**Optional Domestic Time-of-Use (D-TOU)** (needs TOU meter; +18% on 11 May 2026):
Peak [18:30–22:30] 106.00, Day [05:30–18:30] 47.00, Off-peak [22:30–05:30] 33.00 LKR/kWh;
fixed 2,500.00 LKR/month.

### Mapping to the project block model

Only **Regime C fits the model exactly**:

```
D-1, monthly consumption > 180 kWh (Regime C):
blocks: [ { upToKWh: 180, ratePerKWh: 32.50 }, { upToKWh: null, ratePerKWh: 100.00 } ]
fixedChargeLKR: 2500
```

Regimes A and B as per-regime configs (valid only while consumption stays inside the regime):

```
D-1 Regime A (total ≤ 60): blocks [ {30, 5.00}, {60, 9.00} ], fixedChargeLKR: 80 (≤30) or 210 (31–60)  ← per-band fixed: MODEL GAP
D-1 Regime B (60 < total ≤ 180): blocks [ {60, 14.00}, {90, 20.00}, {120, 28.00}, {180, 44.00} ],
    fixedChargeLKR: 400 (61–90) / 1000 (91–120) / 1500 (121–180)                     ← per-band fixed: MODEL GAP
```

**Model gaps (D-1):**
- **Regime switching**: which block array applies depends on total monthly consumption; a single
  ordered block array cannot express this. Options: store all three regimes and select at
  calculation time, or accept per-property configuration of the expected regime.
- **Per-band fixed charge** in regimes A and B: `fixedChargeLKR` is a single value in the model, but
  the official fixed charge varies with the band the month's total lands in.
- 30-day proration of boundaries (see semantics above).

---

## General Purpose (GP-1) — effective 11 May 2026 (S1, Annex 2; unchanged from 1 Apr 2026)

Definition: "Supply of electricity to be used in shops, offices, banks, warehouses, public buildings,
hospitals, educational establishments, places of entertainment **and other premises not covered under
any other tariffs**" — i.e. the commercial catch-all. GP-1 = supply at 400/230 V, contract demand
≤ 42 kVA (S5).

### Official table (volume-differentiated — band rate applies to ALL units)

| Monthly consumption band | Energy (LKR/kWh, applied to entire consumption) | Fixed (LKR/month) |
|---|---|---|
| ≤ 180 kWh | 27.00 | 500.00 |
| > 180 kWh | 36.00 | 1,600.00 |

- **No demand charge for GP-1.** Demand charges exist only at GP-2 (>42 kVA: peak 78.00 / day 51.00 /
  off-peak 40.00, demand 1,800 LKR/kVA, fixed 6,000) and GP-3 (11 kV+: 77.00 / 49.00 / 39.00,
  demand 1,700, fixed 6,000) — both TOU-structured and +18% on 11 May 2026.

### Mapping to the project block model

```
GP-1, band ≤ 180 kWh/month:  blocks [ { upToKWh: null, ratePerKWh: 27.00 } ], fixedChargeLKR: 500
GP-1, band > 180 kWh/month:  blocks [ { upToKWh: null, ratePerKWh: 36.00 } ], fixedChargeLKR: 1600
```

**Model gap (GP-1):** the band switch at 180 kWh is a **whole-bill discontinuity**, not a slab:
180 kWh → 180×27.00+500 = **5,360**; 181 kWh → 181×36.00+1,600 = **8,116** (+SSCL). Encoding
`[{180, 27}, {null, 36}]` as slabs would be **wrong** (it undercharges every month above 180).
Use one single-block config per band and select by expected/actual monthly volume.

---

## Hotel (H-1) — effective 11 May 2026 (S1, Annex 2; unchanged from 1 Apr 2026)

**Eligibility:** "Supply of electricity used for hotels **approved by the Sri Lanka Tourism
Development Authority**" (SLTDA, formerly Ceylon Tourist Board) (S5, S6). H-1 = supply at 400/230 V,
contract demand ≤ 42 kVA (S5).

### Official table (volume-differentiated — band rate applies to ALL units)

| Monthly consumption band | Energy (LKR/kWh, applied to entire consumption) | Fixed (LKR/month) |
|---|---|---|
| ≤ 300 kWh | 9.00 | 300.00 |
| > 300 kWh | 18.00 | 800.00 |

- No demand charge for H-1. (LECO optional prepaid H-1: 19.00 LKR/kWh flat — LECO only.)

### Mapping to the project block model

```
H-1, band ≤ 300 kWh/month:  blocks [ { upToKWh: null, ratePerKWh: 9.00 } ],  fixedChargeLKR: 300
H-1, band > 300 kWh/month:  blocks [ { upToKWh: null, ratePerKWh: 18.00 } ], fixedChargeLKR: 800
```

**Model gap (H-1):** same band-switch discontinuity: 300 kWh → 300×9+300 = **3,000**;
301 kWh → 301×18+800 = **6,218** (+SSCL). Do not encode as slabs.

## Hotel TOU (H-2 / H-3) — recorded for v1.1 (S1, Annex 2)

**There is no TOU variant for H-1 itself** in the current schedule (optional TOU exists only for
Domestic and Agriculture). TOU applies to hotels only via the larger-connection categories, which
took the +18% increase on 11 May 2026:

| | Peak 18:30–22:30 | Day 05:30–18:30 | Off-peak 22:30–05:30 | Demand (LKR/kVA) | Fixed (LKR/month) |
|---|---|---|---|---|---|
| **H-2** (400/230 V, >42 kVA) | 39.00 | 19.00 | 16.50 | 1,650.00 | 6,000.00 |
| **H-3** (11 kV and above) | 38.00 | 18.00 | 15.50 | 1,600.00 | 6,000.00 |

**Model gaps:** TOU windows and per-kVA demand charges are outside the block model entirely
(deferred to v1.1 as planned; the 5-min samples can attribute kWh to these windows later).

---

## Category applicability for a small guesthouse / homestay (S5)

The controlling document is CEB's *Guideline: Determination of Tariff Category* (S5):

- **Who decides:** the distribution licensee determines the category from the purposes declared in
  the supply application; it "will remain unchanged until a request is made by the tariff customer to
  change it or licensee decides to change it on licensee's own investigation" (§3.1).
- **Hotel (H-1):** only premises **approved/registered with SLTDA** qualify. Registration class
  (tourist hotel, guest house, homestay unit, etc.) is SLTDA's domain; CEB's criterion is simply
  SLTDA approval plus the connection size (≤42 kVA ⇒ H-1).
- **Domestic (D-1):** "domestic purposes in private residences". Crucially, §3.4: *"when the domestic
  supply is used for domestic/cottage industry/commercial purposes in the same premises, the tariff
  category **remains unchanged as domestic**, unless the tariff customer requests for industrial or
  general purpose category"*. So an owner-occupied homestay renting rooms on a domestic connection
  typically stays D-1 — **but** the licensee may reclassify after its own investigation and can
  back-bill losses for **up to three months** (§3.4).
- **General Purpose (GP-1):** the catch-all for commercial premises "not covered under any other
  tariffs" — i.e. a guesthouse operating commercially **without SLTDA registration** is GP-1
  territory if/when reclassified. Mixed-use premises: category follows "the purpose for which
  maximum power is required" (§3.4).
- **Why it matters (rates as of 11 May 2026, 400 kWh/month example, before SSCL):**
  D-1 ≈ 180×32.50 + 220×100 + 2,500 = **LKR 30,350**; GP-1 = 400×36 + 1,600 = **LKR 16,000**;
  H-1 = 400×18 + 800 = **LKR 8,000**. SLTDA registration currently roughly **halves** the bill vs
  GP-1 and is ~4× cheaper than staying Domestic at that volume — H-1 was also shielded from the
  May 2026 increase while D>180 was not.
- Disputes go to the licensee's Dispute Resolution Officer under the Electricity (Dispute Resolution
  Procedure) Rules, Gazette Extraordinary No. 1951/1 of 25 Jan 2016 (§4).

Per-property seeding guidance for EcoStay EMS: ask the owner which category appears on their CEB/LECO
bill (it is printed on the bill) rather than inferring from the business type.

---

## Announced but not yet effective

- **Q3 2026 quarterly review is in motion:** NSO filed a Bulk Supply cost submission for Q3 2026 on
  2026-06-15 (posted by PUCSL 2026-06-25) (S8). The May 11 decision already priced in Q3 costs, so a
  mid-quarter change is not expected, but the decision is explicitly effective only "until next
  tariff revision"; the next scheduled end-user revision would be the Q4 2026 review (~1 Oct 2026).
- **Relief signal:** the Commission stated it "would prioritize granting reliefs to the consumer
  groups that did not receive the concession during this tariff revision" (S1 §8) — i.e. D>180,
  D-TOU, GV, GP-2/3, H-2/3, I-2/3, street lighting may see cuts next.
- **Subsidy dependency:** the 0% change for D≤180 / GP-1 / H-1 / I-1 is funded by a one-off
  LKR 15 bn subsidy covering April–September 2026 (S1 §7). If it is not renewed, these categories
  face upward pressure at the next revision. Re-check rates when the Q4 2026 decision lands.
- *(Secondary, UNVERIFIED)* News reporting suggests PUCSL intends a broader move to cost-reflective,
  less cross-subsidised tariff structures during 2026 (e.g. EconomyNext). Treat as context only.

---

## Confidence & gaps

**Verified against primary sources (retrieved 2026-07-04; pucsl.gov.lk, ceb.lk and leco.lk all reachable):**
- All D-1, GP-1, H-1, H-2/H-3, D-TOU, GP-2/GP-3 rates and fixed/demand charges: read directly from
  Annex 2 of the PUCSL May 2026 decision PDF (S1), including the "effective until 10th May 2026"
  column for cross-reference with the April 2026 revision. (The PDF's text layer is scrambled; the
  Annex 2 page was rendered to an image and transcribed — numbers cross-check against the decision's
  §8 percentage table and the LECO calculator constants.)
- Category definitions and reclassification rules: CEB guideline PDF (S5).
- Billing semantics (band switching for GP-1/H-1, incremental blocks + per-band fixed for D-1,
  30-day proration, SSCL gross-up): LECO's official bill-calculator script (S7), which contains
  exactly the 11-May-2026 constants (e.g. `h1Rate=[9,18]`, `gp1Rate=[27,36]`,
  `dom180SPRate=[32.5,100]`).

**Unverified / to re-check before implementation:**
- **SSCL (2.5%) and VAT treatment on EDL (ex-CEB) bills.** SSCL is confirmed in LECO's calculator;
  the calculator applies no VAT. Confirm both on a real bill from the pilot property's licensee
  before shipping cost figures.
- **Volume-band semantics on EDL:** confirmed via LECO's implementation and the Annex 2 table shape;
  EDL is expected to be identical (single approved schedule), but validate the first real EDL bill
  against the calculator.
- The CEB `tariff_catergory` page (S9) shows 2014 rates and the PUCSL Hotels page (S6) shows an older
  revision's rates — neither must be used as a rate source.
- The CEB guideline PDF (S5) is undated; confirm it is still the operative classification guideline
  if a category dispute ever matters.
- Whether the pilot properties' SLTDA registration class (homestay vs guest house) affects CEB's
  willingness to grant H-1 in practice — the written rule only says "approved by SLTDA".

**Model gaps summary (things `{upToKWh, ratePerKWh}[]` + `fixedChargeLKR` cannot express):**
1. Volume-differentiated **band/regime switching** (D-1 regimes; GP-1 at 180 kWh; H-1 at 300 kWh) —
   whole-bill discontinuities; encoding the bands as slabs silently miscomputes.
2. **Per-band fixed charges** inside D-1 regimes A and B.
3. **30-day proration** of block boundaries for non-30-day billing periods.
4. **SSCL gross-up** (≈2.564% on top of the bill).
5. **TOU windows and demand charges** (D-TOU, H-2/H-3, GP-2/GP-3) — already deferred to v1.1.
