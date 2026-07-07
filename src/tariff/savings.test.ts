import { describe, expect, it } from 'vitest';
import { CEB_D1, CEB_H1 } from './ceb-tariffs';
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
