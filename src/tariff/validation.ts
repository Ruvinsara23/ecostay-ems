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
