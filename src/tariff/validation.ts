import { savedLKR } from './savings';
import type { Tariff } from './tariff';

/**
 * §10.2 pre/post validation (capstone success indicator: ≥20% reduction in
 * unoccupied-runtime energy).
 *
 * The avoided energy is NOT re-derived here from vacant hours. It is the
 * RECORDED figure the nightly rollup credited (`src/server/avoided-energy.ts`),
 * where a circuit earns credit only if the samples show it was actually running
 * while the guest was there and physically cut once they left, bounded by a cap.
 * Deriving it from "controlled circuits would have run every vacant hour" was
 * the unbounded counterfactual this model replaced — it let an empty room claim
 * savings it never made, and disagreed with the owner's "Saved this month".
 *
 * Money reuses the gate-#8 savedLKR engine — no new cost math here.
 */
export type ValidationInput = {
  /** Total hours in the measurement window. */
  windowHours: number;
  /** Hours the room was occupied in that window (from real occupancy). */
  occupiedHours: number;
  /** Sum of the automation-controlled circuit wattages (W). */
  controlledWatts: number;
  /** RECORDED avoided energy over the window, summed from the daily aggregates. */
  avoidedKWh: number;
  tariff?: Tariff;
  /** Success threshold — the proposal's indicator is 20%. */
  targetPct?: number;
  /**
   * The property's MONTH-TO-DATE kWh — the CEB regime/band is chosen by the
   * month's total (gate #8), never by this window's few kWh. Without it no
   * rupee figure is produced.
   */
  monthToDateKWh?: number;
};

export type ValidationResult = {
  windowHours: number;
  occupiedHours: number;
  vacantHours: number;
  controlledWatts: number;
  /** Modelled draw of the controlled circuits while the room was occupied. */
  occupiedRuntimeKWh: number;
  /** occupiedRuntimeKWh + avoidedKWh — what they would have drawn uncut. */
  baselineKWh: number;
  /** Recorded avoided energy (input, echoed for display). */
  avoidedKWh: number;
  /** Hours of credited vacancy the avoided energy corresponds to. */
  creditedVacantHours: number;
  /** avoidedKWh / baselineKWh — reduction in controlled-circuit energy. */
  reductionPct: number;
  /** LKR saved at the current tariff (null when no tariff is set). */
  savedLKR: number | null;
  targetPct: number;
  passed: boolean;
};

const round = (value: number, dp = 3): number => Number(value.toFixed(dp));

/** A recorded run: its window and the meter readings that bound it. */
export type RunWindow = {
  startedAt: number;
  endedAt?: number;
  startEnergyKWh?: number;
  endEnergyKWh?: number;
};

/** Windows this far apart (fractionally) make a raw comparison misleading. */
const DURATION_MISMATCH_TOLERANCE = 0.2;

export type RunComparison = {
  baselineKWh: number;
  ecostayKWh: number;
  baselineHours: number;
  ecostayHours: number;
  /** Energy RATE — the fair basis for comparison when windows differ in length. */
  baselineKWhPerHour: number;
  ecostayKWhPerHour: number;
  /** True when the two windows differ by more than 20% — the result is not a valid §10.2 pair. */
  durationMismatch: boolean;
  /** Energy avoided over the EcoStay window, valued at the baseline rate. */
  avoidedKWh: number;
  reductionPct: number;
  /** null when no tariff, or when month-to-date consumption is unknown (band undeterminable). */
  savedLKR: number | null;
  targetPct: number;
  passed: boolean;
};

/** Measured energy of a completed run; null if unfinished or the meter rebooted mid-run. */
export function runKWh(run: RunWindow): number | null {
  if (run.startEnergyKWh === undefined || run.endEnergyKWh === undefined) return null;
  const delta = run.endEnergyKWh - run.startEnergyKWh;
  return delta >= 0 ? round(delta) : null;
}

/** Elapsed hours of a completed run; null if unfinished or non-positive. */
export function runHours(run: RunWindow): number | null {
  if (run.endedAt === undefined) return null;
  const hours = (run.endedAt - run.startedAt) / 3_600_000;
  return hours > 0 ? round(hours, 3) : null;
}

/**
 * The §10.2 result from two MEASURED runs (baseline automation-off vs EcoStay
 * automation-on). Reduction is computed on the energy RATE (kWh/h), NOT raw kWh:
 * a 2 h baseline against a 1 h EcoStay run would otherwise fake a 50% saving.
 * Unequal windows still set `durationMismatch` — the proposal's design compares
 * equal windows under similar occupancy.
 *
 * Money (gate #8): the CEB band is chosen by the property's MONTH-TO-DATE
 * consumption, never by a short run's kWh — pass `monthToDateKWh`, or no rupee
 * figure is produced.
 */
export function compareEvaluationRuns(
  baseline: RunWindow | null,
  ecostay: RunWindow | null,
  options: { tariff?: Tariff; targetPct?: number; monthToDateKWh?: number } = {},
): RunComparison | null {
  if (!baseline || !ecostay) return null;
  const targetPct = options.targetPct ?? 20;

  const baselineKWh = runKWh(baseline);
  const ecostayKWh = runKWh(ecostay);
  const baselineHours = runHours(baseline);
  const ecostayHours = runHours(ecostay);
  if (
    baselineKWh === null ||
    ecostayKWh === null ||
    baselineHours === null ||
    ecostayHours === null
  ) {
    return null;
  }

  // Rates stay UNROUNDED for the maths — rounding them first loses precision and
  // shifts the headline percentage.
  const baselineRate = baselineKWh / baselineHours;
  const ecostayRate = ecostayKWh / ecostayHours;
  const baselineKWhPerHour = round(baselineRate, 4);
  const ecostayKWhPerHour = round(ecostayRate, 4);

  const reductionPct =
    baselineRate > 0 ? round(((baselineRate - ecostayRate) / baselineRate) * 100, 1) : 0;
  // What the EcoStay window would have consumed at the baseline rate, minus what it did.
  const avoidedKWh = Math.max(0, round((baselineRate - ecostayRate) * ecostayHours));

  const longest = Math.max(baselineHours, ecostayHours);
  const durationMismatch =
    longest > 0 && Math.abs(baselineHours - ecostayHours) / longest > DURATION_MISMATCH_TOLERANCE;

  const saved =
    options.tariff && options.monthToDateKWh !== undefined
      ? avoidedKWh > 0
        ? savedLKR(options.tariff, options.monthToDateKWh, avoidedKWh)
        : 0
      : null;

  return {
    baselineKWh,
    ecostayKWh,
    baselineHours,
    ecostayHours,
    baselineKWhPerHour,
    ecostayKWhPerHour,
    durationMismatch,
    avoidedKWh,
    reductionPct,
    savedLKR: saved,
    targetPct,
    passed: reductionPct >= targetPct,
  };
}

export function computeValidation(input: ValidationInput): ValidationResult {
  const targetPct = input.targetPct ?? 20;
  const windowHours = Math.max(0, input.windowHours);
  const occupiedHours = Math.min(Math.max(0, input.occupiedHours), windowHours);
  const vacantHours = round(windowHours - occupiedHours, 2);
  const watts = Math.max(0, input.controlledWatts);
  const avoidedKWh = round(Math.max(0, input.avoidedKWh));

  // What the controlled circuits drew while the guest was in the room. Assuming
  // they ran the whole occupied period OVERSTATES this denominator, which makes
  // the reduction percentage conservative — the safe direction for a claim.
  const occupiedRuntimeKWh = round((watts * occupiedHours) / 1000);
  const baselineKWh = round(occupiedRuntimeKWh + avoidedKWh);
  const creditedVacantHours = watts > 0 ? round((avoidedKWh * 1000) / watts, 2) : 0;

  const reductionPct = baselineKWh > 0 ? round((avoidedKWh / baselineKWh) * 100, 1) : 0;

  const saved =
    input.tariff && input.monthToDateKWh !== undefined
      ? avoidedKWh > 0
        ? savedLKR(input.tariff, input.monthToDateKWh, avoidedKWh)
        : 0
      : null;

  return {
    windowHours: round(windowHours, 2),
    occupiedHours: round(occupiedHours, 2),
    vacantHours,
    controlledWatts: watts,
    occupiedRuntimeKWh,
    baselineKWh,
    avoidedKWh,
    creditedVacantHours,
    reductionPct,
    savedLKR: saved,
    targetPct,
    passed: reductionPct >= targetPct,
  };
}
