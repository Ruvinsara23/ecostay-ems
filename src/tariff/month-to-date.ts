import { colomboDateKey } from '@/server/colombo-time';

/**
 * Sum the current Colombo month's daily kWh. The CEB bill is monthly (the regime
 * is chosen by the whole month's total), so month-to-date kWh is what the tariff
 * engine consumes — never per-day rupees.
 */
export function monthToDateKWh(
  byDate: Record<string, { kWhUsed: number }>,
  nowMs: number,
): number {
  const monthPrefix = colomboDateKey(nowMs).slice(0, 7); // 'yyyy-mm'
  let total = 0;
  for (const [dateKey, aggregate] of Object.entries(byDate)) {
    if (dateKey.startsWith(monthPrefix)) total += aggregate.kWhUsed;
  }
  return Number(total.toFixed(6));
}
