import { colomboDateKey } from '@/server/colombo-time';

/**
 * Sum the current Colombo month's daily kWh. The CEB bill is monthly (the regime
 * is chosen by the whole month's total), so month-to-date kWh is what the tariff
 * engine consumes — never per-day rupees.
 */
export function monthToDateKWh(
  byDate: Record<string, { kWhUsed: number; kWhUsedPeak?: number; kWhUsedDay?: number; kWhUsedOffPeak?: number }>,
  nowMs: number,
): { total: number; peak: number; day: number; offPeak: number } {
  const monthPrefix = colomboDateKey(nowMs).slice(0, 7); // 'yyyy-mm'
  let total = 0;
  let peak = 0;
  let day = 0;
  let offPeak = 0;
  for (const [dateKey, aggregate] of Object.entries(byDate)) {
    if (dateKey.startsWith(monthPrefix)) {
      total += aggregate.kWhUsed;
      peak += aggregate.kWhUsedPeak ?? 0;
      day += aggregate.kWhUsedDay ?? 0;
      offPeak += aggregate.kWhUsedOffPeak ?? 0;
    }
  }
  return {
    total: Number(total.toFixed(6)),
    peak: Number(peak.toFixed(6)),
    day: Number(day.toFixed(6)),
    offPeak: Number(offPeak.toFixed(6)),
  };
}

/** OBJ-07: the current Colombo month's avoided energy (counterfactual, from the rollup). */
export function monthToDateAvoidedKWh(
  byDate: Record<string, { avoidedKWh?: number; avoidedKWhPeak?: number; avoidedKWhDay?: number; avoidedKWhOffPeak?: number }>,
  nowMs: number,
): { total: number; peak: number; day: number; offPeak: number } {
  const monthPrefix = colomboDateKey(nowMs).slice(0, 7);
  let total = 0;
  let peak = 0;
  let day = 0;
  let offPeak = 0;
  for (const [dateKey, aggregate] of Object.entries(byDate)) {
    if (dateKey.startsWith(monthPrefix)) {
      total += aggregate.avoidedKWh ?? 0;
      peak += aggregate.avoidedKWhPeak ?? 0;
      day += aggregate.avoidedKWhDay ?? 0;
      offPeak += aggregate.avoidedKWhOffPeak ?? 0;
    }
  }
  return {
    total: Number(total.toFixed(6)),
    peak: Number(peak.toFixed(6)),
    day: Number(day.toFixed(6)),
    offPeak: Number(offPeak.toFixed(6)),
  };
}
