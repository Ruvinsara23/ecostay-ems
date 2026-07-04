// Emulator-backed proof of rollup windowing + prune safety.
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import { describe, expect, it } from 'vitest';
import { createRollupDeps } from './admin-deps';
import { colomboDayWindow } from './colombo-time';
import { DailyAggregate, pruneSamples, rollupDaily } from './rollup';

const PROJECT_ID = 'demo-ecostay';
const NAMESPACE = `${PROJECT_ID}-default-rtdb`;
const DB_EMULATOR_HOST = '127.0.0.1:9000';

process.env.FIREBASE_DATABASE_EMULATOR_HOST = DB_EMULATOR_HOST;

const adminApp =
  getAdminApps()[0] ??
  initializeAdminApp({
    projectId: PROJECT_ID,
    databaseURL: `http://${DB_EMULATOR_HOST}/?ns=${NAMESPACE}`,
  });
const db = getAdminDatabase(adminApp);

const DATE = '2026-07-04';
const { startMs, endMs } = colomboDayWindow(DATE);
const HISTORY = 'properties/property_001/energyHistory/room_001';

describe('rollup against the RTDB emulator', () => {
  it('aggregates only the in-window samples and prunes only when confirmed', async () => {
    await db.ref().set(null);
    await db.ref('ops/roomIndex/property_001/room_001').set(true);
    await db.ref(HISTORY).push({ energy: 0.5, power: 4, sampledAt: startMs - 40 * 86_400_000 }); // ancient
    await db.ref(HISTORY).push({ energy: 0.9, power: 4, sampledAt: startMs - 60_000 }); // day before
    await db
      .ref(HISTORY)
      .push({ energy: 1.0, power: 4, sampledAt: startMs, occupancyState: 'OCCUPIED_ACTIVE' });
    await db
      .ref(HISTORY)
      .push({ energy: 1.006, power: 4, sampledAt: startMs + 300_000, occupancyState: 'VACANT' });
    await db.ref(HISTORY).push({ energy: 2.0, power: 4, sampledAt: endMs }); // next day

    const deps = createRollupDeps(db);
    const report = await rollupDaily(deps, DATE);
    expect(report).toEqual({ rooms: 1, aggregatesWritten: 1 });

    const aggregate = (
      await db.ref(`properties/property_001/dailyAggregates/room_001/${DATE}`).get()
    ).val() as DailyAggregate;
    expect(aggregate.kWhUsed).toBeCloseTo(0.006, 10); // only the two in-window samples
    expect(aggregate.occupiedMinutes).toBe(5);
    // RTDB stores null as absence — costLKR is simply missing until the tariff phase.
    expect(aggregate.costLKR).toBeUndefined();

    // prune: cutoff 30 days before the window — only the ancient sample qualifies
    const cutoff = startMs - 30 * 86_400_000;
    const dry = await pruneSamples(deps, cutoff, { confirm: false });
    expect(dry).toEqual({ confirmed: false, samples: 1 });
    expect(Object.keys((await db.ref(HISTORY).get()).val() as object)).toHaveLength(5);

    const confirmed = await pruneSamples(deps, cutoff, { confirm: true });
    expect(confirmed).toEqual({ confirmed: true, samples: 1 });
    expect(Object.keys((await db.ref(HISTORY).get()).val() as object)).toHaveLength(4);
  });

  it('re-running a date overwrites the aggregate (idempotent)', async () => {
    const deps = createRollupDeps(db);
    await rollupDaily(deps, DATE);
    await rollupDaily(deps, DATE);

    const aggregates = (
      await db.ref('properties/property_001/dailyAggregates/room_001').get()
    ).val() as Record<string, DailyAggregate>;
    expect(Object.keys(aggregates)).toEqual([DATE]);
  });
});
