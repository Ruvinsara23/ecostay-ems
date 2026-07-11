import { describe, expect, it } from 'vitest';
import { monthToDateAvoidedKWh, monthToDateKWh } from './month-to-date';

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
    expect(monthToDateKWh(byDate, JULY_5_COLOMBO)).toEqual({ total: 3.75, peak: 0, day: 0, offPeak: 0 });
  });

  it('is zero when there is nothing this month', () => {
    expect(monthToDateKWh({ '2026-06-15': { kWhUsed: 4 } }, JULY_5_COLOMBO)).toEqual({ total: 0, peak: 0, day: 0, offPeak: 0 });
  });

  it('is zero for an empty history', () => {
    expect(monthToDateKWh({}, JULY_5_COLOMBO)).toEqual({ total: 0, peak: 0, day: 0, offPeak: 0 });
  });

  it('sums the TOU window buckets alongside the total', () => {
    const byDate = {
      '2026-07-01': { kWhUsed: 3, kWhUsedPeak: 1, kWhUsedDay: 1.5, kWhUsedOffPeak: 0.5 },
      '2026-07-04': { kWhUsed: 2, kWhUsedPeak: 0.5, kWhUsedDay: 1, kWhUsedOffPeak: 0.5 },
      '2026-06-30': { kWhUsed: 9, kWhUsedPeak: 9, kWhUsedDay: 0, kWhUsedOffPeak: 0 }, // prev month
    };
    expect(monthToDateKWh(byDate, JULY_5_COLOMBO)).toEqual({ total: 5, peak: 1.5, day: 2.5, offPeak: 1 });
  });

  it('treats pre-TOU aggregates (no window fields) as zero buckets, keeping the total honest', () => {
    const byDate = { '2026-07-02': { kWhUsed: 4 } };
    expect(monthToDateKWh(byDate, JULY_5_COLOMBO)).toEqual({ total: 4, peak: 0, day: 0, offPeak: 0 });
  });
});

describe('monthToDateAvoidedKWh', () => {
  it('sums avoided energy and its TOU buckets for the current Colombo month', () => {
    const byDate = {
      '2026-07-01': { avoidedKWh: 0.5, avoidedKWhPeak: 0.2, avoidedKWhDay: 0.2, avoidedKWhOffPeak: 0.1 },
      '2026-07-03': { avoidedKWh: 0.5, avoidedKWhPeak: 0.3, avoidedKWhDay: 0.1, avoidedKWhOffPeak: 0.1 },
      '2026-06-28': { avoidedKWh: 9, avoidedKWhPeak: 9, avoidedKWhDay: 0, avoidedKWhOffPeak: 0 }, // prev month
    };
    expect(monthToDateAvoidedKWh(byDate, JULY_5_COLOMBO)).toEqual({
      total: 1,
      peak: 0.5,
      day: 0.3,
      offPeak: 0.2,
    });
  });

  it('treats missing avoided fields as zero (pre-migration days)', () => {
    expect(monthToDateAvoidedKWh({ '2026-07-02': {} }, JULY_5_COLOMBO)).toEqual({
      total: 0,
      peak: 0,
      day: 0,
      offPeak: 0,
    });
  });
});
