import { OCCUPANCY_STATES, OccupancyState } from '@/telemetry/contract';
import { isOccupied } from '@/telemetry/is-occupied';
import {
  MAX_CREDIT_MS_PER_VACANCY,
  NOMINAL_SAMPLE_INTERVAL_MS,
  avoidedEnergyKWh,
} from './avoided-energy';
import { colomboDayWindow, colomboTouWindow } from './colombo-time';
import type { EnergySample } from './sample-energy';

export const SAMPLE_INTERVAL_MINUTES = 5;

/**
 * How far before the day boundary the rollup reads. A vacancy that began the
 * previous evening must still be able to prove which circuits were running when
 * the guest left, so the lookback covers a full credit window plus one sample.
 * These extra samples ARM only — they are never aggregated or credited.
 */
const ARM_LOOKBACK_MS = MAX_CREDIT_MS_PER_VACANCY + NOMINAL_SAMPLE_INTERVAL_MS;

/**
 * Circuits the comfort-load automation controls; their rated wattage prices the
 * savings. `airConditioner` (ADR-0013) is optional — a property configured
 * before it existed keeps working and simply claims nothing for the AC.
 */
export type CircuitWattages = { lights: number; exhaustFan: number; airConditioner?: number };

export type DailyAggregate = {
  kWhUsed: number;
  kWhUsedPeak?: number;
  kWhUsedDay?: number;
  kWhUsedOffPeak?: number;
  costLKR: number | null; // null: cost is priced on the client via the tariff engine (ADR-0008)
  occupiedMinutes: number;
  /** Counterfactual energy the controlled circuits would have drawn while confirmed-vacant. */
  avoidedKWh: number;
  avoidedKWhPeak?: number;
  avoidedKWhDay?: number;
  avoidedKWhOffPeak?: number;
};

export type RollupDeps = {
  listRooms(): Promise<Array<{ propertyId: string; roomId: string }>>;
  readSamplesInWindow(
    propertyId: string,
    roomId: string,
    startMs: number,
    endMs: number,
  ): Promise<EnergySample[]>;
  /** Rated wattage of the controlled circuits (null = not configured → no savings claimed). */
  readCircuitWattages(propertyId: string): Promise<CircuitWattages | null>;
  writeDailyAggregate(
    propertyId: string,
    roomId: string,
    dateKey: string,
    aggregate: DailyAggregate,
  ): Promise<void>;
  readSampleKeysBefore(propertyId: string, roomId: string, cutoffMs: number): Promise<string[]>;
  deleteSamples(propertyId: string, roomId: string, sampleKeys: string[]): Promise<void>;
};

export type RollupReport = { rooms: number; aggregatesWritten: number };

/**
 * Nightly rollup (ADR-0006 workload #2). kWh from cumulative deltas; a negative
 * delta is a device reboot — the counter restarted from ~0, so the post-reboot
 * reading itself is the consumption since. A day with no samples gets NO
 * aggregate (charts must show a gap, never a fake zero). Idempotent: re-running
 * a date overwrites the same aggregate.
 */
export async function rollupDaily(deps: RollupDeps, dateKey: string): Promise<RollupReport> {
  const { startMs, endMs } = colomboDayWindow(dateKey);
  const report: RollupReport = { rooms: 0, aggregatesWritten: 0 };

  for (const { propertyId, roomId } of await deps.listRooms()) {
    report.rooms += 1;
    // Read back past midnight so a vacancy that began yesterday can still be
    // armed from the stay that preceded it; only in-day samples are aggregated.
    const withLookback = (
      await deps.readSamplesInWindow(propertyId, roomId, startMs - ARM_LOOKBACK_MS, endMs)
    ).sort((a, b) => a.sampledAt - b.sampledAt);
    const samples = withLookback.filter((sample) => sample.sampledAt >= startMs);
    if (samples.length === 0) continue;

    let kWhUsed = 0;
    let kWhUsedPeak = 0;
    let kWhUsedDay = 0;
    let kWhUsedOffPeak = 0;

    for (let i = 1; i < samples.length; i++) {
      let delta = samples[i].energy - samples[i - 1].energy;
      if (delta < 0) delta = samples[i].energy;
      
      kWhUsed += delta;
      
      const window = colomboTouWindow(samples[i].sampledAt);
      if (window === 'peak') kWhUsedPeak += delta;
      else if (window === 'day') kWhUsedDay += delta;
      else kWhUsedOffPeak += delta;
    }

    const occupiedMinutes =
      samples.filter(
        (s) =>
          s.occupancyState !== undefined &&
          OCCUPANCY_STATES.includes(s.occupancyState as OccupancyState) &&
          isOccupied(s.occupancyState as OccupancyState),
      ).length * SAMPLE_INTERVAL_MINUTES;

    // OBJ-07 savings: credit a circuit only where the samples show it was
    // actually running while the guest was there and physically cut once they
    // left (see avoided-energy.ts). A room nobody occupied earns nothing.
    const wattages = await deps.readCircuitWattages(propertyId);
    const avoided = avoidedEnergyKWh(withLookback, {
      wattages: wattages ?? {},
      windowStartMs: startMs,
    });

    await deps.writeDailyAggregate(propertyId, roomId, dateKey, {
      kWhUsed: Number(kWhUsed.toFixed(6)),
      kWhUsedPeak: Number(kWhUsedPeak.toFixed(6)),
      kWhUsedDay: Number(kWhUsedDay.toFixed(6)),
      kWhUsedOffPeak: Number(kWhUsedOffPeak.toFixed(6)),
      costLKR: null,
      occupiedMinutes,
      avoidedKWh: Number(avoided.total.toFixed(6)),
      avoidedKWhPeak: Number(avoided.peak.toFixed(6)),
      avoidedKWhDay: Number(avoided.day.toFixed(6)),
      avoidedKWhOffPeak: Number(avoided.offPeak.toFixed(6)),
    });
    report.aggregatesWritten += 1;
  }

  return report;
}

export type PruneReport = { confirmed: boolean; samples: number };

/**
 * 90-day raw retention (grilled decision) — RISK GATE #4: deletes nothing unless
 * explicitly confirmed (route additionally requires PRUNE_ENABLED=true, set by
 * the human after reviewing a dry-run report).
 */
export async function pruneSamples(
  deps: RollupDeps,
  cutoffMs: number,
  options: { confirm: boolean },
): Promise<PruneReport> {
  let total = 0;
  for (const { propertyId, roomId } of await deps.listRooms()) {
    const keys = await deps.readSampleKeysBefore(propertyId, roomId, cutoffMs);
    total += keys.length;
    if (options.confirm && keys.length > 0) {
      await deps.deleteSamples(propertyId, roomId, keys);
    }
  }
  return { confirmed: options.confirm, samples: total };
}
