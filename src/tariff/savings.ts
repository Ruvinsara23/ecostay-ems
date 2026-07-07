import { marginalRatePerKWh } from './compute-bill';
import type { Tariff } from './tariff';

/**
 * OBJ-07 savings priced via the tariff engine: value the avoided energy at the
 * CURRENT band's marginal rate (× SSCL), not the full bill difference. A full
 * bill delta would, near a band boundary, attribute the entire whole-bill jump
 * to a few avoided kWh and wildly overstate savings (H-1: 13.7 kWh → LKR 3,415).
 * Marginal-rate pricing is the honest, conservative headline number.
 */
export function savedLKR(tariff: Tariff, actualKWh: number, avoidedKWh: number): number {
  if (avoidedKWh <= 0) return 0;
  const rate = marginalRatePerKWh(tariff, actualKWh);
  return Number((avoidedKWh * rate * (1 + tariff.sscl)).toFixed(2));
}
