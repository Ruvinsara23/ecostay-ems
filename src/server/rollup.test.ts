import { describe, expect, it } from 'vitest';
import { colomboDateKey, colomboDayWindow, colomboYesterdayKey } from './colombo-time';
import type { EnergySample } from './sample-energy';
import { DailyAggregate, pruneSamples, rollupDaily, RollupDeps } from './rollup';

describe('Colombo time helpers (UTC+5:30, no DST)', () => {
  it('maps a UTC instant to its Colombo calendar date', () => {
    // 2026-07-03T19:00Z = 2026-07-04 00:30 in Colombo
    expect(colomboDateKey(Date.UTC(2026, 6, 3, 19, 0))).toBe('2026-07-04');
    // 2026-07-03T18:00Z = 2026-07-03 23:30 in Colombo
    expect(colomboDateKey(Date.UTC(2026, 6, 3, 18, 0))).toBe('2026-07-03');
  });

  it('produces the [00:00, 24:00) Colombo window for a date key', () => {
    const { startMs, endMs } = colomboDayWindow('2026-07-04');
    expect(startMs).toBe(Date.UTC(2026, 6, 3, 18, 30));
    expect(endMs).toBe(Date.UTC(2026, 6, 4, 18, 30));
  });

  it('yesterday key at 00:05 Colombo is the just-finished day', () => {
    const at0005Colombo = Date.UTC(2026, 6, 3, 18, 35); // 2026-07-04 00:05 Colombo
    expect(colomboYesterdayKey(at0005Colombo)).toBe('2026-07-03');
  });
});

function sample(sampledAt: number, energy: number, occupancyState?: string): EnergySample {
  return {
    energy,
    power: 4,
    sampledAt,
    ...(occupancyState ? { occupancyState: occupancyState as EnergySample['occupancyState'] } : {}),
  };
}

function makeDeps(
  samplesByRoom: Record<string, EnergySample[]>,
  wattages: { lights: number; exhaustFan: number } | null = { lights: 60, exhaustFan: 45 },
) {
  const written: Array<{ key: string; dateKey: string; aggregate: DailyAggregate }> = [];
  const deleted: Array<{ key: string; sampleKeys: string[] }> = [];
  const deps: RollupDeps = {
    async listRooms() {
      return Object.keys(samplesByRoom).map((key) => {
        const [propertyId, roomId] = key.split('/');
        return { propertyId, roomId };
      });
    },
    async readSamplesInWindow(propertyId, roomId, startMs, endMs) {
      return (samplesByRoom[`${propertyId}/${roomId}`] ?? []).filter(
        (s) => s.sampledAt >= startMs && s.sampledAt < endMs,
      );
    },
    async writeDailyAggregate(propertyId, roomId, dateKey, aggregate) {
      written.push({ key: `${propertyId}/${roomId}`, dateKey, aggregate });
    },
    async readSampleKeysBefore(propertyId, roomId, cutoffMs) {
      return (samplesByRoom[`${propertyId}/${roomId}`] ?? [])
        .filter((s) => s.sampledAt < cutoffMs)
        .map((s) => `key-${s.sampledAt}`);
    },
    async deleteSamples(propertyId, roomId, sampleKeys) {
      deleted.push({ key: `${propertyId}/${roomId}`, sampleKeys });
    },
    async readCircuitWattages() {
      return wattages;
    },
  };
  return { deps, written, deleted };
}

const { startMs } = colomboDayWindow('2026-07-04');
const T = (minutes: number) => startMs + minutes * 60_000;

describe('rollupDaily', () => {
  it('sums cumulative deltas and occupied minutes for the day', async () => {
    const { deps, written } = makeDeps({
      'property_001/room_001': [
        sample(T(0), 1.0, 'VACANT'),
        sample(T(5), 1.004, 'OCCUPIED_ACTIVE'),
        sample(T(10), 1.01, 'OCCUPIED_IDLE'),
        sample(T(15), 1.012, 'VACANT_CONFIRMED'),
      ],
    });

    await rollupDaily(deps, '2026-07-04');

    expect(written).toEqual([
      {
        key: 'property_001/room_001',
        dateKey: '2026-07-04',
        aggregate: {
          kWhUsed: 0.012,
          kWhUsedPeak: 0,
          kWhUsedDay: 0,
          kWhUsedOffPeak: 0.012,
          costLKR: null,
          occupiedMinutes: 10,
          avoidedKWh: 0.00875,
          avoidedKWhPeak: 0,
          avoidedKWhDay: 0,
          avoidedKWhOffPeak: 0.00875,
        },
      },
    ]);
  });

  it('splits kWh and avoided energy into TOU windows by each delta\'s later sample', async () => {
    // Colombo windows on 2026-07-04, in minutes after Colombo midnight:
    // day opens 05:30 = T(330), peak 18:30 = T(1110), off-peak 22:30 = T(1380).
    const { deps, written } = makeDeps(
      {
        'property_001/room_001': [
          sample(T(330), 1.0), // 05:30 — baseline, no delta
          sample(T(335), 1.2), // 05:35 → +0.2 lands in day
          sample(T(1110), 1.5, 'VACANT_CONFIRMED'), // 18:30 → +0.3 lands in peak (boundary sample)
          sample(T(1385), 1.9), // 23:05 → +0.4 lands in off-peak
        ],
      },
      { lights: 100, exhaustFan: 20 }, // 120 W → 0.01 kWh per confirmed-vacant sample
    );

    await rollupDaily(deps, '2026-07-04');

    const aggregate = written[0].aggregate;
    expect(aggregate.kWhUsed).toBeCloseTo(0.9, 6);
    expect(aggregate.kWhUsedDay).toBeCloseTo(0.2, 6);
    expect(aggregate.kWhUsedPeak).toBeCloseTo(0.3, 6);
    expect(aggregate.kWhUsedOffPeak).toBeCloseTo(0.4, 6);
    // the window buckets always reconcile with the total
    expect(
      (aggregate.kWhUsedDay ?? 0) + (aggregate.kWhUsedPeak ?? 0) + (aggregate.kWhUsedOffPeak ?? 0),
    ).toBeCloseTo(aggregate.kWhUsed, 6);
    // the one confirmed-vacant sample sat at 18:30 → its avoided energy is peak energy
    expect(aggregate.avoidedKWh).toBeCloseTo(0.01, 6);
    expect(aggregate.avoidedKWhPeak).toBeCloseTo(0.01, 6);
    expect(aggregate.avoidedKWhDay).toBeCloseTo(0, 6);
    expect(aggregate.avoidedKWhOffPeak).toBeCloseTo(0, 6);
  });

  it('avoided energy = controlled wattage × confirmed-vacant time', async () => {
    const { deps, written } = makeDeps(
      {
        'property_001/room_001': [
          sample(T(0), 1.0, 'VACANT_CONFIRMED'),
          sample(T(5), 1.0, 'VACANT_CONFIRMED'),
          sample(T(10), 1.0, 'VACANT_CONFIRMED'), // 3 samples = 15 confirmed-vacant minutes
          sample(T(15), 1.0, 'OCCUPIED_ACTIVE'),
        ],
      },
      { lights: 100, exhaustFan: 20 }, // 120 W controlled
    );

    await rollupDaily(deps, '2026-07-04');

    // 120 W × (15/60) h = 30 Wh = 0.03 kWh
    expect(written[0].aggregate.avoidedKWh).toBeCloseTo(0.03, 10);
  });

  it('avoided energy is 0 when no wattages are configured', async () => {
    const { deps, written } = makeDeps(
      { 'property_001/room_001': [sample(T(0), 1, 'VACANT_CONFIRMED'), sample(T(5), 1, 'VACANT_CONFIRMED')] },
      null,
    );
    await rollupDaily(deps, '2026-07-04');
    expect(written[0].aggregate.avoidedKWh).toBe(0);
  });

  it('treats a reboot (negative delta) as consumption restarting from zero', async () => {
    const { deps, written } = makeDeps({
      'property_001/room_001': [
        sample(T(0), 1.0),
        sample(T(5), 1.004),
        sample(T(10), 0.002), // reboot: counter reset, then accumulated 0.002
        sample(T(15), 0.01),
      ],
    });

    await rollupDaily(deps, '2026-07-04');

    expect(written[0].aggregate.kWhUsed).toBeCloseTo(0.014, 10); // 0.004 + 0.002 + 0.008
  });

  it('writes nothing for a day with no samples — a gap, not a zero', async () => {
    const { deps, written } = makeDeps({ 'property_001/room_001': [] });
    const report = await rollupDaily(deps, '2026-07-04');
    expect(written).toEqual([]);
    expect(report).toEqual({ rooms: 1, aggregatesWritten: 0 });
  });
});

describe('pruneSamples', () => {
  const CUTOFF = T(0);

  it('dry-run reports what it would delete and touches nothing', async () => {
    const { deps, deleted } = makeDeps({
      'property_001/room_001': [sample(CUTOFF - 100_000, 1), sample(CUTOFF + 100_000, 2)],
    });

    const report = await pruneSamples(deps, CUTOFF, { confirm: false });

    expect(report).toEqual({ confirmed: false, samples: 1 });
    expect(deleted).toEqual([]);
  });

  it('confirmed run deletes exactly the old samples', async () => {
    const { deps, deleted } = makeDeps({
      'property_001/room_001': [sample(CUTOFF - 100_000, 1), sample(CUTOFF + 100_000, 2)],
    });

    const report = await pruneSamples(deps, CUTOFF, { confirm: true });

    expect(report).toEqual({ confirmed: true, samples: 1 });
    expect(deleted).toEqual([
      { key: 'property_001/room_001', sampleKeys: [`key-${CUTOFF - 100_000}`] },
    ]);
  });
});
