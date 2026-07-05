// The regime/band tariff model (ADR-0008). CEB/LECO tariffs are NOT simple slabs:
// a monthly total selects a regime/band, then energy is charged either `flat`
// (band rate on all units — GP-1, H-1) or `slab` (incremental — Domestic).

export type TariffBlock = {
  /** This block covers units up to here; null = unbounded top block. */
  upToKWh: number | null;
  ratePerKWh: number;
  /** The monthly fixed charge that applies IF the month's total lands in this block. */
  fixedChargeLKR: number;
};

export type TariffRegime = {
  /** This regime applies when the monthly total ≤ here; null = unbounded top regime. */
  upToKWh: number | null;
  method: 'flat' | 'slab';
  /** Ordered by upToKWh ascending; the last block's upToKWh is null. */
  blocks: TariffBlock[];
};

export type Tariff = {
  category: string;
  /** Levy multiplier applied to the whole bill (LECO SSCL ≈ 2.5⁄97.5). */
  sscl: number;
  /** Ordered by upToKWh ascending; the last regime's upToKWh is null. */
  regimes: TariffRegime[];
};

export type Bill = {
  energyLKR: number;
  fixedLKR: number;
  beforeSsclLKR: number;
  ssclLKR: number;
  totalLKR: number;
};
