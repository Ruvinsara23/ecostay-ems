import { describe, expect, it } from 'vitest';
import { CEB_D1, CEB_D_TOU, CEB_H1 } from './ceb-tariffs';
import { savedLKR } from './savings';

const sscl = 1 + 2.5 / 97.5;

describe('savedLKR — avoided energy at the current band marginal rate', () => {
  it('H-1 within a band: 40 kWh avoided at the 9 LKR rate', () => {
    // 40 × 9 × (1+SSCL) = 369.23 — NOT a bill delta
    expect(savedLKR(CEB_H1, 100, 40)).toBeCloseTo(40 * 9 * sscl, 2);
  });

  it('does NOT overstate near a band boundary (the discontinuity artifact)', () => {
    // actual 290 (≤300 band, rate 9), avoid 20. A bill-delta would flip the whole
    // bill to the 18-band and report ~LKR 3,000+. Marginal-rate stays honest.
    expect(savedLKR(CEB_H1, 290, 20)).toBeCloseTo(20 * 9 * sscl, 2); // 184.62
    expect(savedLKR(CEB_H1, 290, 20)).toBeLessThan(500);
  });

  it('D-1 slab: prices at the marginal slab rate of the current consumption', () => {
    // 100 kWh sits in D-1 regime B, 91–120 block @28 LKR → avoided priced at 28
    expect(savedLKR(CEB_D1, 100, 5)).toBeCloseTo(5 * 28 * sscl, 2);
  });

  it('is zero when nothing was avoided', () => {
    expect(savedLKR(CEB_H1, 100, 0)).toBe(0);
  });
});

describe('savedLKR — TOU prices avoided energy by the window it was avoided in', () => {
  it('D-TOU: 1 peak + 2 day + 3 off-peak avoided', () => {
    // 1×106 + 2×47 + 3×33 = 299, then SSCL on top
    expect(savedLKR(CEB_D_TOU, 100, 6, { peak: 1, day: 2, offPeak: 3 })).toBeCloseTo(299 * sscl, 2);
  });

  it('peak-hour savings are worth more than the same energy off-peak', () => {
    const peakSaving = savedLKR(CEB_D_TOU, 100, 2, { peak: 2, day: 0, offPeak: 0 });
    const offPeakSaving = savedLKR(CEB_D_TOU, 100, 2, { peak: 0, day: 0, offPeak: 2 });
    expect(peakSaving).toBeGreaterThan(offPeakSaving);
    expect(peakSaving).toBeCloseTo(2 * 106 * sscl, 2);
    expect(offPeakSaving).toBeCloseTo(2 * 33 * sscl, 2);
  });

  it('without a TOU breakdown falls back to the day-rate marginal price', () => {
    expect(savedLKR(CEB_D_TOU, 100, 2)).toBeCloseTo(2 * 47 * sscl, 2);
  });

  it('TOU zero avoided is zero', () => {
    expect(savedLKR(CEB_D_TOU, 100, 0, { peak: 0, day: 0, offPeak: 0 })).toBe(0);
  });
});
