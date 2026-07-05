import { describe, expect, it } from 'vitest';
import { computeBill } from './compute-bill';
import { CEB_D1, CEB_GP1, CEB_H1 } from './ceb-tariffs';

// Worked examples are transcribed from docs/research/ceb-tariff-schedule.md (PUCSL decision
// effective 11 May 2026). Expected values are computed there, independent of this code —
// NOT recomputed the way the implementation would (risk gate #8). SSCL is applied on top.
const withSscl = (n: number) => Number((n * (1 + 2.5 / 97.5)).toFixed(2));

describe('computeBill — H-1 (SLTDA hotel, band-switch, applies band rate to ALL units)', () => {
  it('at 300 kWh: 300×9 + 300 fixed', () => {
    const bill = computeBill(CEB_H1, 300);
    expect(bill.energyLKR).toBe(2700);
    expect(bill.fixedLKR).toBe(300);
    expect(bill.beforeSsclLKR).toBe(3000);
    expect(bill.totalLKR).toBe(withSscl(3000)); // 3076.92
  });

  it('at 301 kWh the whole bill jumps a band (discontinuity, not a slab): 301×18 + 800', () => {
    const bill = computeBill(CEB_H1, 301);
    expect(bill.beforeSsclLKR).toBe(301 * 18 + 800); // 6218 — nearly double 300 kWh
  });
});

describe('computeBill — GP-1 (commercial catch-all, band-switch)', () => {
  it('at 180 kWh: 180×27 + 500', () => {
    expect(computeBill(CEB_GP1, 180).beforeSsclLKR).toBe(180 * 27 + 500); // 5360
  });
  it('at 181 kWh: 181×36 + 1600 (band jump)', () => {
    expect(computeBill(CEB_GP1, 181).beforeSsclLKR).toBe(181 * 36 + 1600); // 8116
  });
});

describe('computeBill — D-1 domestic (regime-selected, incremental slabs)', () => {
  it('regime A, ≤30 kWh: 25×5 + 80 fixed', () => {
    const bill = computeBill(CEB_D1, 25);
    expect(bill.energyLKR).toBe(125);
    expect(bill.fixedLKR).toBe(80);
    expect(bill.beforeSsclLKR).toBe(205);
  });

  it('regime A, 31–60 band: 45 kWh = 30×5 + 15×9, fixed 210', () => {
    const bill = computeBill(CEB_D1, 45);
    expect(bill.energyLKR).toBe(30 * 5 + 15 * 9); // 285
    expect(bill.fixedLKR).toBe(210);
  });

  it('regime B slab, 100 kWh: 60×14 + 30×20 + 10×28, fixed of the 91–120 band = 1000', () => {
    const bill = computeBill(CEB_D1, 100);
    expect(bill.energyLKR).toBe(60 * 14 + 30 * 20 + 10 * 28); // 1720
    expect(bill.fixedLKR).toBe(1000);
    expect(bill.beforeSsclLKR).toBe(2720);
  });

  it('regime C slab, 400 kWh: 180×32.5 + 220×100 + fixed 2500 = 30350', () => {
    const bill = computeBill(CEB_D1, 400);
    expect(bill.energyLKR).toBe(180 * 32.5 + 220 * 100); // 27850
    expect(bill.fixedLKR).toBe(2500);
    expect(bill.beforeSsclLKR).toBe(30350);
  });

  it('regime boundary: 60 vs 61 kWh selects different regimes', () => {
    // 60 kWh → regime A (0–60): 30×5 + 30×9 + fixed 210 = 630
    expect(computeBill(CEB_D1, 60).beforeSsclLKR).toBe(30 * 5 + 30 * 9 + 210); // 630
    // 61 kWh → regime B (blocks from unit 1): 60×14 + 1×20 + fixed 400 = 1260
    expect(computeBill(CEB_D1, 61).beforeSsclLKR).toBe(60 * 14 + 1 * 20 + 400); // 1260
  });
});

describe('computeBill — edge cases', () => {
  it('zero consumption still charges the fixed charge of the lowest band', () => {
    const bill = computeBill(CEB_H1, 0);
    expect(bill.energyLKR).toBe(0);
    expect(bill.fixedLKR).toBe(300);
  });

  it('rounds money to 2 decimals', () => {
    const bill = computeBill(CEB_H1, 137);
    expect(Number.isFinite(bill.totalLKR)).toBe(true);
    expect(bill.totalLKR).toBeCloseTo(withSscl(137 * 9 + 300), 2);
  });
});
