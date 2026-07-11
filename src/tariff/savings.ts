import { marginalRatePerKWh } from './compute-bill';
import type { Tariff } from './tariff';

/**
 * OBJ-07 savings priced via the tariff engine: value the avoided energy at the
 * CURRENT band's marginal rate (× SSCL), not the full bill difference. A full
 * bill delta would, near a band boundary, attribute the entire whole-bill jump
 * to a few avoided kWh and wildly overstate savings (H-1: 13.7 kWh → LKR 3,415).
 * Marginal-rate pricing is the honest, conservative headline number.
 */
export function savedLKR(
  tariff: Tariff,
  actualKWh: number,
  avoidedKWh: number,
  avoidedTou?: { peak: number; day: number; offPeak: number }
): number {
  if (avoidedKWh <= 0) return 0;
  
  if (tariff.isTOU && tariff.touRates && avoidedTou) {
    const energy = 
      avoidedTou.peak * tariff.touRates.peak +
      avoidedTou.day * tariff.touRates.day +
      avoidedTou.offPeak * tariff.touRates.offPeak;
    return Number((energy * (1 + tariff.sscl)).toFixed(2));
  }
  
  const rate = marginalRatePerKWh(tariff, actualKWh);
  return Number((avoidedKWh * rate * (1 + tariff.sscl)).toFixed(2));
}
