import { describe, expect, it } from 'vitest';
import { CEB_H1 } from './ceb-tariffs';
import { compareEvaluationRuns, computeValidation, runKWh } from './validation';

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

  it('prices the saving at the band chosen by MONTH-TO-DATE consumption (gate #8)', () => {
    const r = computeValidation({
      windowHours: 24,
      occupiedHours: 12,
      controlledWatts: 105,
      tariff: CEB_H1,
      monthToDateKWh: 850,
    });
    expect(r.savedLKR).not.toBeNull();
    expect(r.savedLKR as number).toBeGreaterThan(0);
  });

  it('refuses to price the saving when month-to-date consumption is unknown', () => {
    // Without the month's total the CEB band is undeterminable — no rupee figure.
    const r = computeValidation({
      windowHours: 24,
      occupiedHours: 12,
      controlledWatts: 105,
      tariff: CEB_H1,
    });
    expect(r.savedLKR).toBeNull();
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

const HOUR = 3_600_000;
/** A run of `hours` length consuming `kWh`. */
const run = (hours: number, kWh: number) => ({
  startedAt: 0,
  endedAt: hours * HOUR,
  startEnergyKWh: 100,
  endEnergyKWh: 100 + kWh,
});

describe('runKWh / compareEvaluationRuns (measured A/B)', () => {
  it('measures a run as end − start cumulative energy', () => {
    expect(runKWh({ startedAt: 0, endedAt: HOUR, startEnergyKWh: 10, endEnergyKWh: 13.1 })).toBe(3.1);
  });

  it('returns null for an unfinished run or a mid-run meter reboot', () => {
    expect(runKWh({ startedAt: 0, startEnergyKWh: 10 })).toBeNull();
    expect(runKWh({ startedAt: 0, endedAt: HOUR, startEnergyKWh: 10, endEnergyKWh: 2 })).toBeNull();
  });

  it('computes the reduction and verdict from two equal-length measured runs', () => {
    const cmp = compareEvaluationRuns(run(24, 3.1), run(24, 1.35), {
      tariff: CEB_H1,
      monthToDateKWh: 850,
    });
    expect(cmp).not.toBeNull();
    expect(cmp!.baselineKWh).toBe(3.1);
    expect(cmp!.ecostayKWh).toBe(1.35);
    expect(cmp!.reductionPct).toBe(56.5);
    expect(cmp!.durationMismatch).toBe(false);
    expect(cmp!.passed).toBe(true);
    expect(cmp!.savedLKR as number).toBeGreaterThan(0);
  });

  it('does NOT fake a saving when the baseline simply ran longer (audit #2)', () => {
    // Same energy RATE (1 kWh/h) — a 2 h baseline vs a 1 h EcoStay run must show 0%,
    // not the 50% a raw-kWh comparison would report.
    const cmp = compareEvaluationRuns(run(2, 2), run(1, 1), {});
    expect(cmp!.baselineKWhPerHour).toBe(1);
    expect(cmp!.ecostayKWhPerHour).toBe(1);
    expect(cmp!.reductionPct).toBe(0);
    expect(cmp!.passed).toBe(false);
    expect(cmp!.durationMismatch).toBe(true); // and the mismatch is surfaced
  });

  it('flags windows that differ by more than 20% as not a valid §10.2 pair', () => {
    expect(compareEvaluationRuns(run(24, 4), run(24, 2), {})!.durationMismatch).toBe(false);
    expect(compareEvaluationRuns(run(24, 4), run(12, 1), {})!.durationMismatch).toBe(true);
  });

  it('refuses a rupee figure without month-to-date consumption (gate #8 band)', () => {
    const cmp = compareEvaluationRuns(run(24, 3.1), run(24, 1.35), { tariff: CEB_H1 });
    expect(cmp!.savedLKR).toBeNull();
  });

  it('is null until both runs are present and complete', () => {
    expect(compareEvaluationRuns(null, run(1, 1), {})).toBeNull();
    expect(
      compareEvaluationRuns({ startedAt: 0, startEnergyKWh: 1 }, run(1, 1), {}),
    ).toBeNull();
  });

  it('fails the target when EcoStay did not cut enough', () => {
    const cmp = compareEvaluationRuns(run(24, 10), run(24, 9), {}); // only 10% less
    expect(cmp!.reductionPct).toBe(10);
    expect(cmp!.passed).toBe(false);
  });
});
