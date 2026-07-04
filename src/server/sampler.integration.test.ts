// Emulator-backed proof of the sampler path: ops/roomIndex → latest → energyHistory.
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import { describe, expect, it } from 'vitest';
import { createSamplerDeps } from './admin-deps';
import { EnergySample, sampleEnergy } from './sample-energy';

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

const NOW = 2_000_000_000_000;

describe('sampler against the RTDB emulator', () => {
  it('appends a sample for a fresh indexed room and skips stale/unreported ones', async () => {
    await db.ref().set(null);
    await db.ref().update({
      'ops/roomIndex/property_001/room_001': true,
      'ops/roomIndex/property_001/room_002': true,
      'ops/roomIndex/property_002/room_001': true,
      'properties/property_001/rooms/room_001/latest': {
        energy: 1.234,
        power: 4.7,
        occupancyState: 'OCCUPIED_ACTIVE',
        updatedAt: NOW - 4_000,
      },
      // room_002 never reports; property_002/room_001 is stale
      'properties/property_002/rooms/room_001/latest': {
        energy: 9.9,
        power: 0.6,
        updatedAt: NOW - 3_600_000,
      },
    });

    const report = await sampleEnergy(createSamplerDeps(db), NOW);

    expect(report).toEqual({ sampled: 1, skippedNoData: 1, skippedStale: 1 });

    const history = (await db.ref('properties/property_001/energyHistory/room_001').get()).val() as Record<
      string,
      EnergySample
    >;
    const samples = Object.values(history ?? {});
    expect(samples).toHaveLength(1);
    expect(samples[0]).toEqual({
      energy: 1.234,
      power: 4.7,
      occupancyState: 'OCCUPIED_ACTIVE',
      sampledAt: NOW,
    });

    expect((await db.ref('properties/property_002/energyHistory').get()).val()).toBeNull();
  });

  it('accumulates history across repeated runs', async () => {
    await db.ref().set(null);
    await db.ref().update({
      'ops/roomIndex/property_001/room_001': true,
      'properties/property_001/rooms/room_001/latest': {
        energy: 1.0,
        power: 4.0,
        updatedAt: NOW - 2_000,
      },
    });
    const deps = createSamplerDeps(db);

    await sampleEnergy(deps, NOW);
    await db
      .ref('properties/property_001/rooms/room_001/latest')
      .update({ energy: 1.004, updatedAt: NOW + 300_000 - 2_000 });
    await sampleEnergy(deps, NOW + 300_000);

    const history = (await db.ref('properties/property_001/energyHistory/room_001').get()).val() as Record<
      string,
      EnergySample
    >;
    const energies = Object.values(history).map((s) => s.energy).sort();
    expect(energies).toEqual([1.0, 1.004]);
  });
});
