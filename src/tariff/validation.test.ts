import { describe, expect, it } from 'vitest';
import { CEB_H1 } from './ceb-tariffs';
import { computeValidation } from './validation';

describe('computeValidation (§10.2 pre/post)', () => {
  it('a room vacant half the day yields a 50% reduction and passes the 20% target', () => {
    const r = computeValidation({ windowHours: 24, occupiedHours: 12, controlledWatts: 100 });
    expect(r.baselineKWh).toBe(2.4); // 100 W × 24 h
    expect(r.automatedKWh).toBe(1.2); // 100 W × 12 h
    expect(r.avoidedKWh).toBe(1.2);
    expect(r.vacantHours).toBe(12);
    expect(r.totalReductionPct).toBe(50);
    expect(r.wastageReductionPct).toBe(100);
    expect(r.passed).toBe(true);
  });

  it('a mostly-occupied room falls below the 20% target', () => {
    const r = computeValidation({ windowHours: 24, occupiedHours: 21.6, controlledWatts: 100 });
    expect(r.totalReductionPct).toBe(10);
    expect(r.passed).toBe(false);
  });

  it('prices the saving through the tariff engine when a tariff is set', () => {
    const r = computeValidation({
      windowHours: 24,
      occupiedHours: 12,
      controlledWatts: 105,
      tariff: CEB_H1,
    });
    expect(r.savedLKR).not.toBeNull();
    expect(r.savedLKR as number).toBeGreaterThan(0);
  });

  it('returns null savings (not zero) when no tariff is configured', () => {
    const r = computeValidation({ windowHours: 24, occupiedHours: 12, controlledWatts: 100 });
    expect(r.savedLKR).toBeNull();
  });

  it('clamps occupied time to the window and never reports negative vacancy', () => {
    const r = computeValidation({ windowHours: 24, occupiedHours: 30, controlledWatts: 100 });
    expect(r.occupiedHours).toBe(24);
    expect(r.vacantHours).toBe(0);
    expect(r.avoidedKWh).toBe(0);
    expect(r.totalReductionPct).toBe(0);
    expect(r.passed).toBe(false);
  });

  it('reports no reduction when no circuits are configured', () => {
    const r = computeValidation({ windowHours: 24, occupiedHours: 12, controlledWatts: 0 });
    expect(r.baselineKWh).toBe(0);
    expect(r.totalReductionPct).toBe(0);
    expect(r.passed).toBe(false);
  });
});
