import { savedLKR } from './savings';
import type { Tariff } from './tariff';

/**
 * §10.2 pre/post validation (capstone success indicator: ≥20% reduction in
 * unoccupied-runtime energy). Modelled from MEASURED occupancy + RATED circuit
 * wattage — the reduction is a function of occupancy, so it does not require the
 * power meter; the meter later upgrades rated → measured wattage. Money reuses
 * the gate-#8 savedLKR engine — no new cost math here.
 */
export type ValidationInput = {
  /** Total hours in the measurement window. */
  windowHours: number;
  /** Hours the room was occupied in that window (from real occupancy). */
  occupiedHours: number;
  /** Sum of the automation-controlled circuit wattages (W). */
  controlledWatts: number;
  tariff?: Tariff;
  /** Success threshold — the proposal's indicator is 20%. */
  targetPct?: number;
};

export type ValidationResult = {
  windowHours: number;
  occupiedHours: number;
  vacantHours: number;
  controlledWatts: number;
  /** No automation: controlled circuits run the whole window. */
  baselineKWh: number;
  /** With EcoStay: controlled circuits run only while occupied. */
  automatedKWh: number;
  /** Energy avoided by cutting the circuits during vacancy. */
  avoidedKWh: number;
  /** Reduction in total controlled-circuit energy vs baseline. */
  totalReductionPct: number;
  /** Share of the unoccupied-runtime wastage that is eliminated. */
  wastageReductionPct: number;
  /** LKR saved at the current tariff (null when no tariff is set). */
  savedLKR: number | null;
  targetPct: number;
  passed: boolean;
};

const round = (value: number, dp = 3): number => Number(value.toFixed(dp));

/** A recorded run reduced to its measured energy (end − start cumulative kWh). */
export type RunEnergy = { startEnergyKWh?: number; endEnergyKWh?: number };

export type RunComparison = {
  baselineKWh: number;
  ecostayKWh: number;
  reductionPct: number;
  savedLKR: number | null;
  targetPct: number;
  passed: boolean;
};

/** Measured energy of a completed run; null if unfinished or the meter rebooted mid-run. */
export function runKWh(run: RunEnergy): number | null {
  if (run.startEnergyKWh === undefined || run.endEnergyKWh === undefined) return null;
  const delta = run.endEnergyKWh - run.startEnergyKWh;
  return delta >= 0 ? round(delta) : null;
}

/**
 * The §10.2 result from two MEASURED runs (baseline automation-off vs EcoStay
 * automation-on). Returns null until both runs have usable measured energy.
 */
export function compareEvaluationRuns(
  baseline: RunEnergy | null,
  ecostay: RunEnergy | null,
  tariff?: Tariff,
  targetPct = 20,
): RunComparison | null {
  if (!baseline || !ecostay) return null;
  const baselineKWh = runKWh(baseline);
  const ecostayKWh = runKWh(ecostay);
  if (baselineKWh === null || ecostayKWh === null) return null;

  const reductionPct = baselineKWh > 0 ? round(((baselineKWh - ecostayKWh) / baselineKWh) * 100, 1) : 0;
  const avoided = Math.max(0, round(baselineKWh - ecostayKWh));
  const saved = tariff ? (avoided > 0 ? savedLKR(tariff, ecostayKWh, avoided) : 0) : null;

  return {
    baselineKWh,
    ecostayKWh,
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

  const baselineKWh = round((watts * windowHours) / 1000);
  const automatedKWh = round((watts * occupiedHours) / 1000);
  const avoidedKWh = round(baselineKWh - automatedKWh);

  const totalReductionPct = baselineKWh > 0 ? round((avoidedKWh / baselineKWh) * 100, 1) : 0;
  // Baseline wastage is all the vacant-hour runtime; automation eliminates it.
  const wastageReductionPct = avoidedKWh > 0 ? 100 : 0;

  const saved = input.tariff
    ? avoidedKWh > 0
      ? savedLKR(input.tariff, automatedKWh, avoidedKWh)
      : 0
    : null;

  return {
    windowHours: round(windowHours, 2),
    occupiedHours: round(occupiedHours, 2),
    vacantHours,
    controlledWatts: watts,
    baselineKWh,
    automatedKWh,
    avoidedKWh,
    totalReductionPct,
    wastageReductionPct,
    savedLKR: saved,
    targetPct,
    passed: totalReductionPct >= targetPct,
  };
}
