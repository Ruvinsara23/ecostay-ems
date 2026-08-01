import type { OccupancyState } from '@/telemetry/contract';
import {
  type ComfortLoadCommandKey,
  comfortLoadCommandAllowed,
} from '@/telemetry/occupancy-policy';
import { colomboTouWindow } from './colombo-time';
import type { EnergySample } from './sample-energy';

/** Rated wattage per automation-controlled circuit. A circuit absent here never earns credit. */
export type CircuitWattageMap = Partial<Record<ComfortLoadCommandKey, number>>;

export type AvoidedEnergy = {
  total: number;
  peak: number;
  day: number;
  offPeak: number;
};

export type AvoidedEnergyOptions = {
  wattages: CircuitWattageMap;
  /** Credit only samples at or after this instant — the rollup's day window start. */
  windowStartMs: number;
  /** Ceiling on one continuous vacancy. Defaults to MAX_CREDIT_MS_PER_VACANCY. */
  maxCreditMs?: number;
  /** Upper clamp on the gap between consecutive samples. */
  nominalIntervalMs?: number;
};

/**
 * A guest who leaves with the lights on is the wastage this system targets, and
 * that absence is bounded in practice — beyond a few hours an operator
 * intervenes. Without a ceiling a checked-out room would mint avoided energy
 * forever (RISK GATE #8: this constant is a judgement, not a derivation).
 */
export const MAX_CREDIT_MS_PER_VACANCY = 4 * 3_600_000; // 4 h

/** Sampler cadence (ADR-0006 workload #1) — a longer real gap is clamped to this. */
export const NOMINAL_SAMPLE_INTERVAL_MS = 5 * 60_000;

/** Guest present and the comfort policy lets a load actually run: evidence of use. */
const ARMING_STATES: ReadonlySet<OccupancyState> = new Set([
  'OCCUPIED_ACTIVE',
  'OCCUPIED_IDLE',
  'OCCUPIED_SLEEPING',
]);

/**
 * Vacancy the cutoff is credited for. OCCUPIED_SLEEPING is deliberately absent —
 * the guest is present, and ADR-0014 keeps the AC running there anyway.
 */
const CREDITED_STATES: ReadonlySet<OccupancyState> = new Set([
  'EXIT_PENDING',
  'VACANT_CONFIRMED',
]);

/**
 * OBJ-07 avoided energy, from recorded evidence rather than assumption.
 *
 * A circuit is ARMED when a sample shows it commanded on while the occupancy
 * policy allowed it to run — i.e. it was actually energised. It then earns
 * `wattage × interval` for each subsequent sample in a credited vacancy state,
 * where the same policy blocks it, until the guest returns or the cap is spent.
 *
 * Physical off-ness comes from `comfortLoadCommandAllowed`, NOT the command
 * boolean: ADR-0014 retains commands through EXIT_PENDING while the firmware
 * holds the relay off, so the command still reads `true` there.
 *
 * A room nobody occupied therefore earns nothing however long it sits vacant,
 * and a circuit the guest switched off themselves earns nothing either.
 *
 * Still MODELLED, not measured: rated wattage × recorded time, and `relays`
 * carries the command, not a relay acknowledgement (the firmware has no ack).
 */
export function avoidedEnergyKWh(
  samples: EnergySample[],
  options: AvoidedEnergyOptions,
): AvoidedEnergy {
  const maxCreditMs = options.maxCreditMs ?? MAX_CREDIT_MS_PER_VACANCY;
  const nominalIntervalMs = options.nominalIntervalMs ?? NOMINAL_SAMPLE_INTERVAL_MS;
  const circuits = (Object.keys(options.wattages) as ComfortLoadCommandKey[]).filter(
    (circuit) => (options.wattages[circuit] ?? 0) > 0,
  );

  const result: AvoidedEnergy = { total: 0, peak: 0, day: 0, offPeak: 0 };
  if (circuits.length === 0) return result;

  let armed: Partial<Record<ComfortLoadCommandKey, boolean>> = {};
  let vacancyCreditedMs = 0;
  let previousAt: number | undefined;

  for (const sample of samples) {
    const gapMs =
      previousAt === undefined
        ? 0
        : Math.min(Math.max(0, sample.sampledAt - previousAt), nominalIntervalMs);
    previousAt = sample.sampledAt;

    const state = sample.occupancyState;
    if (state === undefined) continue; // nothing to reason about

    // A reboot drops the FSM to VACANT: continuity with the previous stay is lost.
    if (state === 'VACANT') {
      armed = {};
      vacancyCreditedMs = 0;
      continue;
    }

    if (ARMING_STATES.has(state)) {
      vacancyCreditedMs = 0;
      for (const circuit of circuits) {
        // Only a sample where the load was ALLOWED tells us whether it was running.
        if (comfortLoadCommandAllowed(state, circuit)) {
          armed[circuit] = sample.relays?.[circuit] === true;
        }
      }
      continue;
    }

    if (!CREDITED_STATES.has(state)) {
      // ENTRY_DETECTED — the guest is arriving, so any vacancy has ended.
      vacancyCreditedMs = 0;
      continue;
    }

    const effectiveMs = Math.min(gapMs, Math.max(0, maxCreditMs - vacancyCreditedMs));
    vacancyCreditedMs += gapMs;
    if (effectiveMs <= 0 || sample.sampledAt < options.windowStartMs) continue;

    const touWindow = colomboTouWindow(sample.sampledAt);
    for (const circuit of circuits) {
      if (armed[circuit] !== true) continue;
      // Still permitted to run in this state → it is not off → nothing avoided.
      if (comfortLoadCommandAllowed(state, circuit)) continue;
      const energy = ((options.wattages[circuit] ?? 0) * (effectiveMs / 3_600_000)) / 1000;
      result.total += energy;
      result[touWindow] += energy;
    }
  }

  return result;
}
