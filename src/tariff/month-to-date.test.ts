import { describe, expect, it } from 'vitest';
import { monthToDateKWh } from './month-to-date';

// Colombo is UTC+5:30. A daily aggregate is keyed by its Colombo date 'yyyy-mm-dd'.
const JULY_5_COLOMBO = Date.UTC(2026, 6, 5, 6, 0); // 2026-07-05 11:30 Colombo

describe('monthToDateKWh', () => {
  it('sums only the current Colombo month', () => {
    const byDate = {
      '2026-06-30': { kWhUsed: 9 }, // prev month — excluded
      '2026-07-01': { kWhUsed: 1.5 },
      '2026-07-04': { kWhUsed: 2.25 },
      '2026-08-01': { kWhUsed: 5 }, // next month — excluded
    };
    expect(monthToDateKWh(byDate, JULY_5_COLOMBO)).toBe(3.75);
  });

  it('is zero when there is nothing this month', () => {
    expect(monthToDateKWh({ '2026-06-15': { kWhUsed: 4 } }, JULY_5_COLOMBO)).toBe(0);
  });

  it('is zero for an empty history', () => {
    expect(monthToDateKWh({}, JULY_5_COLOMBO)).toBe(0);
  });
});
