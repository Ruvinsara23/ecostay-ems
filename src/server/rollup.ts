import { OCCUPANCY_STATES, OccupancyState } from '@/telemetry/contract';
import { isOccupied } from '@/telemetry/is-occupied';
import { colomboDayWindow } from './colombo-time';
import type { EnergySample } from './sample-energy';

export const SAMPLE_INTERVAL_MINUTES = 5;

export type DailyAggregate = {
  kWhUsed: number;
  costLKR: number | null; // null until the tariff engine phase (ADR-0008)
  occupiedMinutes: number;
};

export type RollupDeps = {
  listRooms(): Promise<Array<{ propertyId: string; roomId: string }>>;
  readSamplesInWindow(
    propertyId: string,
    roomId: string,
    startMs: number,
    endMs: number,
  ): Promise<EnergySample[]>;
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
    const samples = (await deps.readSamplesInWindow(propertyId, roomId, startMs, endMs)).sort(
      (a, b) => a.sampledAt - b.sampledAt,
    );
    if (samples.length === 0) continue;

    let kWhUsed = 0;
    for (let i = 1; i < samples.length; i++) {
      const delta = samples[i].energy - samples[i - 1].energy;
      kWhUsed += delta >= 0 ? delta : samples[i].energy;
    }

    const occupiedMinutes =
      samples.filter(
        (s) =>
          s.occupancyState !== undefined &&
          OCCUPANCY_STATES.includes(s.occupancyState as OccupancyState) &&
          isOccupied(s.occupancyState as OccupancyState),
      ).length * SAMPLE_INTERVAL_MINUTES;

    await deps.writeDailyAggregate(propertyId, roomId, dateKey, {
      kWhUsed: Number(kWhUsed.toFixed(6)),
      costLKR: null,
      occupiedMinutes,
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
