import type { Tariff } from './tariff';

// Seed rates transcribed from docs/research/ceb-tariff-schedule.md — PUCSL
// "Decision on Electricity Tariffs, Effective from May 11, 2026" (Annex 2).
// RISK GATE #8: cited, not invented; human-reviewed. Open before trusting cost totals:
//   (1) verify the SSCL 2.5% (and any VAT) on a REAL EDL/CEB bill from the pilot property;
//   (2) re-check rates at the Q4 2026 PUCSL revision — the D-1≤180 / GP-1 / H-1 freeze
//       rides on a subsidy ending Sep 2026.
// TOU (D-TOU, H-2/H-3) and 30-day proration are out of this model (v1.1).

const CEB_SSCL = 2.5 / 97.5; // LECO calculator: bill ÷ 97.5 × 2.5 ≈ 0.025641

/** Domestic — regime by monthly total; incremental slabs within a regime. */
export const CEB_D1: Tariff = {
  category: 'D-1 (Domestic)',
  sscl: CEB_SSCL,
  regimes: [
    {
      upToKWh: 60,
      method: 'slab',
      blocks: [
        { upToKWh: 30, ratePerKWh: 5, fixedChargeLKR: 80 },
        { upToKWh: 60, ratePerKWh: 9, fixedChargeLKR: 210 },
      ],
    },
    {
      upToKWh: 180,
      method: 'slab',
      blocks: [
        { upToKWh: 60, ratePerKWh: 14, fixedChargeLKR: 0 },
        { upToKWh: 90, ratePerKWh: 20, fixedChargeLKR: 400 },
        { upToKWh: 120, ratePerKWh: 28, fixedChargeLKR: 1000 },
        { upToKWh: 180, ratePerKWh: 44, fixedChargeLKR: 1500 },
      ],
    },
    {
      upToKWh: null,
      method: 'slab',
      blocks: [
        { upToKWh: 180, ratePerKWh: 32.5, fixedChargeLKR: 0 },
        { upToKWh: null, ratePerKWh: 100, fixedChargeLKR: 2500 },
      ],
    },
  ],
};

/** General Purpose (commercial catch-all ≤ 42 kVA) — band rate applies to ALL units. */
export const CEB_GP1: Tariff = {
  category: 'GP-1 (General Purpose)',
  sscl: CEB_SSCL,
  regimes: [
    { upToKWh: 180, method: 'flat', blocks: [{ upToKWh: null, ratePerKWh: 27, fixedChargeLKR: 500 }] },
    { upToKWh: null, method: 'flat', blocks: [{ upToKWh: null, ratePerKWh: 36, fixedChargeLKR: 1600 }] },
  ],
};

/** Hotel (SLTDA-approved ≤ 42 kVA) — band rate applies to ALL units. */
export const CEB_H1: Tariff = {
  category: 'H-1 (Hotel)',
  sscl: CEB_SSCL,
  regimes: [
    { upToKWh: 300, method: 'flat', blocks: [{ upToKWh: null, ratePerKWh: 9, fixedChargeLKR: 300 }] },
    { upToKWh: null, method: 'flat', blocks: [{ upToKWh: null, ratePerKWh: 18, fixedChargeLKR: 800 }] },
  ],
};

/** Category is seeded from the customer's actual CEB/LECO bill, not inferred (see research note). */
export const CEB_TARIFFS: Record<string, Tariff> = {
  'D-1': CEB_D1,
  'GP-1': CEB_GP1,
  'H-1': CEB_H1,
};
