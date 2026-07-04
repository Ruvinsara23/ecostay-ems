import type { RoomLatest } from '@/rooms/room-data-source';
import type { OccupancyState } from '@/telemetry/contract';

/** A room stops being sampled after this much silence — frozen values are not history. */
export const SAMPLER_STALENESS_LIMIT_MS = 600_000; // 10 min = 2 missed sample periods

export type EnergySample = {
  energy: number; // cumulative kWh, copied verbatim (reboot resets detected at read time)
  power: number; // W
  occupancyState?: OccupancyState; // captured for the savings analysis (CONTEXT.md)
  sampledAt: number; // server-ish clock of the runtime
};

export type SamplerDeps = {
  listRooms(): Promise<Array<{ propertyId: string; roomId: string }>>;
  readLatest(propertyId: string, roomId: string): Promise<RoomLatest | null>;
  appendEnergySample(propertyId: string, roomId: string, sample: EnergySample): Promise<void>;
};

export type SamplerReport = {
  sampled: number;
  skippedNoData: number; // never reported, or snapshot without usable energy/power
  skippedStale: number; // device silent past the staleness limit
};

/** The 5-minute energy sampler (ADR-0006 workload #1, ADR-0010 runtime). Pure: clock injected. */
export async function sampleEnergy(deps: SamplerDeps, nowMs: number): Promise<SamplerReport> {
  const report: SamplerReport = { sampled: 0, skippedNoData: 0, skippedStale: 0 };
  const rooms = await deps.listRooms();

  for (const { propertyId, roomId } of rooms) {
    const latest = await deps.readLatest(propertyId, roomId);
    if (latest === null || latest.energy === undefined || latest.power === undefined) {
      report.skippedNoData += 1;
      continue;
    }
    if (latest.updatedAt === undefined || nowMs - latest.updatedAt > SAMPLER_STALENESS_LIMIT_MS) {
      report.skippedStale += 1;
      continue;
    }
    const sample: EnergySample = {
      energy: latest.energy,
      power: latest.power,
      sampledAt: nowMs,
    };
    if (latest.occupancyState !== undefined) sample.occupancyState = latest.occupancyState;
    await deps.appendEnergySample(propertyId, roomId, sample);
    report.sampled += 1;
  }

  return report;
}
