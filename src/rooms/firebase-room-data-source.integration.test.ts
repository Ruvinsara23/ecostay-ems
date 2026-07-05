// Runs against the Auth + RTDB emulators: `npm run test:integration`.
// Proves the real adapter surfaces firmware-shaped `latest` writes AND that the
// transitional ruleset (database.rules.json) lets a property member read them.
import { deleteApp, initializeApp, FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import { afterEach, describe, expect, it } from 'vitest';
import type { DeviceCommands } from '@/telemetry/contract';
import type { RoomLatest } from './room-data-source';
import { createFirebaseRoomDataSource } from './firebase-room-data-source';

async function waitUntil(predicate: () => boolean, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitUntil timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const PROJECT_ID = 'demo-ecostay';
const NAMESPACE = `${PROJECT_ID}-default-rtdb`;
const AUTH_EMULATOR = '127.0.0.1:9099';
const DB_EMULATOR_HOST = '127.0.0.1';
const DB_EMULATOR_PORT = 9000;

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = `${DB_EMULATOR_HOST}:${DB_EMULATOR_PORT}`;

const adminApp =
  getAdminApps()[0] ??
  initializeAdminApp({
    projectId: PROJECT_ID,
    databaseURL: `http://${DB_EMULATOR_HOST}:${DB_EMULATOR_PORT}/?ns=${NAMESPACE}`,
  });
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminDatabase(adminApp);

const FIRMWARE_SNAPSHOT = {
  voltage: 229.8,
  current: 0.02,
  power: 4.7,
  energy: 1.234,
  gas: 150,
  pir: true,
  doorOpen: false,
  temperature: 27.5,
  humidity: 62,
  lightLevel: 0,
  waterLevel: 76,
  flowRate: 0,
  totalLiters: 12.4,
  relayStatus: true,
  buzzerStatus: false,
  occupancyState: 'OCCUPIED_ACTIVE',
  humanPresent: true,
  motionDetected: true,
  updatedAt: 1_751_600_000_000,
};

let appCounter = 0;
const liveApps: FirebaseApp[] = [];

async function wipe() {
  await adminDb.ref().set(null);
  const response = await fetch(
    `http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error(`account wipe failed: ${response.status}`);
}

/** Provision a role-claimed user (owner gets property_001 membership), sign in, return their client Database + session. */
async function signedInDb(role: 'owner' | 'admin') {
  const email = `${role}@ecostay.test`;
  const user = await adminAuth.createUser({ email, password: `${role}-pass-1` });
  await adminAuth.setCustomUserClaims(user.uid, { role });
  if (role === 'owner') {
    await adminDb.ref().update({
      [`properties/property_001/members/${user.uid}`]: 'owner',
      [`users/${user.uid}/properties/property_001`]: true,
    });
  }

  const app = initializeApp(
    {
      apiKey: 'fake-emulator-key',
      projectId: PROJECT_ID,
      databaseURL: `https://${NAMESPACE}.firebaseio.com`,
    },
    `rooms-integration-${appCounter++}`,
  );
  liveApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, DB_EMULATOR_HOST, DB_EMULATOR_PORT);
  await signInWithEmailAndPassword(auth, email, `${role}-pass-1`);
  return { db, uid: user.uid, email, role };
}

async function signedInOwnerDb() {
  return (await signedInDb('owner')).db;
}

/** Two-property world: owner is a member of property_001 only. */
async function seedTwoProperties() {
  await adminDb.ref().update({
    'properties/property_001/name': 'EcoStay Property',
    'properties/property_001/rooms/room_001/name': 'Room 1',
    'properties/property_002/name': 'Lagoon Villa',
    'properties/property_002/rooms/room_001/name': 'Garden Room',
    'properties/property_002/rooms/room_002/name': 'Lake Room',
  });
}

function collectEmissions(db: ReturnType<typeof getDatabase>) {
  const source = createFirebaseRoomDataSource(db);
  const emissions: Array<RoomLatest | null> = [];
  const unsubscribe = source.subscribeLatest('property_001', 'room_001', (latest) =>
    emissions.push(latest),
  );
  return {
    emissions,
    unsubscribe,
    async waitForCount(count: number, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      while (emissions.length < count) {
        if (Date.now() > deadline) {
          throw new Error(`timed out; saw ${JSON.stringify(emissions)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
  };
}

afterEach(async () => {
  await Promise.all(liveApps.splice(0).map((app) => deleteApp(app)));
});

describe('FirebaseRoomDataSource against the transitional ruleset', () => {
  it('reports null for a room that has never written latest', async () => {
    await wipe();
    const db = await signedInOwnerDb();
    const recorder = collectEmissions(db);
    await recorder.waitForCount(1);
    expect(recorder.emissions[0]).toBeNull();
    recorder.unsubscribe();
  });

  it('surfaces a firmware-shaped write to latest, typed per the contract', async () => {
    await wipe();
    const db = await signedInOwnerDb();
    const recorder = collectEmissions(db);
    await recorder.waitForCount(1); // initial null

    await adminDb
      .ref('properties/property_001/rooms/room_001/latest')
      .set(FIRMWARE_SNAPSHOT);

    await recorder.waitForCount(2);
    const latest = recorder.emissions[1];
    expect(latest?.temperature).toBe(27.5);
    expect(latest?.occupancyState).toBe('OCCUPIED_ACTIVE');
    expect(latest?.energy).toBe(1.234);
    expect(latest?.relayStatus).toBe(true);
    expect(latest?.updatedAt).toBe(1_751_600_000_000);
    recorder.unsubscribe();
  });

  it('keeps following subsequent writes (the 3-second cadence)', async () => {
    await wipe();
    const db = await signedInOwnerDb();
    const recorder = collectEmissions(db);
    await recorder.waitForCount(1);

    const latestRef = adminDb.ref('properties/property_001/rooms/room_001/latest');
    await latestRef.set(FIRMWARE_SNAPSHOT);
    await latestRef.update({ temperature: 28.1, occupancyState: 'OCCUPIED_IDLE' });

    await recorder.waitForCount(3);
    expect(recorder.emissions[2]?.temperature).toBe(28.1);
    expect(recorder.emissions[2]?.occupancyState).toBe('OCCUPIED_IDLE');
    recorder.unsubscribe();
  });
});

describe('server-time offset', () => {
  it('surfaces a numeric offset from .info/serverTimeOffset', async () => {
    await wipe();
    const owner = await signedInDb('owner');
    const source = createFirebaseRoomDataSource(owner.db);

    const offsets: number[] = [];
    const unsubscribe = source.subscribeServerTimeOffset((offset) => offsets.push(offset));
    const deadline = Date.now() + 8000;
    while (offsets.length === 0) {
      if (Date.now() > deadline) throw new Error('no offset emission');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(Number.isFinite(offsets[0])).toBe(true);
    unsubscribe();
  });
});

describe('tenancy through the ruleset', () => {
  it('an owner lists only the rooms of properties they are a member of, with names', async () => {
    await wipe();
    await seedTwoProperties();
    const owner = await signedInDb('owner');
    const source = createFirebaseRoomDataSource(owner.db);

    const rooms = await source.listAccessibleRooms({
      uid: owner.uid,
      email: owner.email,
      role: 'owner',
    });

    expect(rooms).toEqual([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        propertyName: 'EcoStay Property',
        roomName: 'Room 1',
      },
    ]);
  });

  it('an admin lists rooms across every property', async () => {
    await wipe();
    await seedTwoProperties();
    const admin = await signedInDb('admin');
    const source = createFirebaseRoomDataSource(admin.db);

    const rooms = await source.listAccessibleRooms({
      uid: admin.uid,
      email: admin.email,
      role: 'admin',
    });

    expect(rooms.map((room) => `${room.propertyId}/${room.roomId}`)).toEqual([
      'property_001/room_001',
      'property_002/room_001',
      'property_002/room_002',
    ]);
    expect(rooms[1].roomName).toBe('Garden Room');
  });

  it('rules deny an owner reading a property they are not a member of', async () => {
    await wipe();
    await seedTwoProperties();
    const owner = await signedInDb('owner');

    const { get: clientGet, ref: clientRef } = await import('firebase/database');
    await expect(
      clientGet(clientRef(owner.db, 'properties/property_002')),
    ).rejects.toThrow(/permission/i);
  });
});

describe('device commands through the ruleset (risk gate #3)', () => {
  it("a member's command write round-trips through the subscription", async () => {
    await wipe();
    await seedTwoProperties();
    const owner = await signedInDb('owner');
    const source = createFirebaseRoomDataSource(owner.db);

    const emissions: DeviceCommands[] = [];
    const unsubscribe = source.subscribeDeviceCommands('property_001', 'room_001', (c) =>
      emissions.push(c),
    );
    await waitUntil(() => emissions.length >= 1); // initial {}

    await source.setDeviceCommand('property_001', 'room_001', 'lights', true);

    await waitUntil(() => emissions[emissions.length - 1]?.lights === true);
    expect(emissions[emissions.length - 1]).toEqual({ lights: true });
    unsubscribe();
  });

  it("a signed-in NON-member's command write is denied by the rules", async () => {
    await wipe();
    await seedTwoProperties();
    // Owner-role user with NO membership record — rules must reject the write.
    const stranger = await adminAuth.createUser({
      email: 'stranger@ecostay.test',
      password: 'stranger-pass-1',
    });
    await adminAuth.setCustomUserClaims(stranger.uid, { role: 'owner' });
    const app = initializeApp(
      {
        apiKey: 'fake-emulator-key',
        projectId: PROJECT_ID,
        databaseURL: `https://${NAMESPACE}.firebaseio.com`,
      },
      `stranger-${appCounter++}`,
    );
    liveApps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
    const db = getDatabase(app);
    connectDatabaseEmulator(db, DB_EMULATOR_HOST, DB_EMULATOR_PORT);
    await signInWithEmailAndPassword(auth, 'stranger@ecostay.test', 'stranger-pass-1');
    const source = createFirebaseRoomDataSource(db);

    await expect(
      source.setDeviceCommand('property_001', 'room_001', 'lights', true),
    ).rejects.toThrow(/permission/i);
  });

  it('owner can flip the automation toggle through the rules; non-boolean is rejected', async () => {
    await wipe();
    await seedTwoProperties();
    const owner = await signedInDb('owner');
    const { ref: clientRef, set: clientSet } = await import('firebase/database');
    const toggleRef = clientRef(
      owner.db,
      'properties/property_001/rooms/room_001/settings/automationEnabled',
    );

    await clientSet(toggleRef, true); // member write allowed

    await expect(clientSet(toggleRef, 'yes' as unknown as boolean)).rejects.toThrow(
      /permission/i,
    ); // .validate newData.isBoolean()
  });

  it('owner reads windowed energy history and daily aggregates through the rules', async () => {
    await wipe();
    await seedTwoProperties();
    const historyRef = adminDb.ref('properties/property_001/energyHistory/room_001');
    await historyRef.push({ energy: 1.0, power: 4.0, sampledAt: 1_000 });
    await historyRef.push({ energy: 1.1, power: 4.2, sampledAt: 5_000 });
    await adminDb
      .ref('properties/property_001/dailyAggregates/room_001/2026-07-03')
      .set({ kWhUsed: 0.4, occupiedMinutes: 300 });

    const owner = await signedInDb('owner');
    const source = createFirebaseRoomDataSource(owner.db);

    const historyEmissions: number[][] = [];
    const unsubHistory = source.subscribeEnergyHistory(
      'property_001',
      'room_001',
      2_000,
      (samples) => historyEmissions.push(samples.map((s) => s.sampledAt)),
    );
    await waitUntil(() => historyEmissions.length >= 1);
    expect(historyEmissions[0]).toEqual([5_000]); // window + .indexOn work client-side
    unsubHistory();

    const aggregateEmissions: string[][] = [];
    const unsubAggregates = source.subscribeDailyAggregates(
      'property_001',
      'room_001',
      (byDate) => aggregateEmissions.push(Object.keys(byDate)),
    );
    await waitUntil(() => aggregateEmissions.length >= 1);
    expect(aggregateEmissions[0]).toEqual(['2026-07-03']);
    unsubAggregates();
  });

  it('owner reads the property tariff category through the rules', async () => {
    await wipe();
    await seedTwoProperties();
    await adminDb.ref('properties/property_001/settings/tariffCategory').set('H-1');
    const owner = await signedInDb('owner');
    const source = createFirebaseRoomDataSource(owner.db);

    const emissions: Array<string | null> = [];
    const unsubscribe = source.subscribeTariffCategory('property_001', (c) => emissions.push(c));
    await waitUntil(() => emissions.length >= 1);

    expect(emissions[0]).toBe('H-1');
    unsubscribe();
  });

  it('owner acknowledges an alert through the rules; forgery and edits are denied', async () => {
    await wipe();
    await seedTwoProperties();
    const alertRef = adminDb.ref('properties/property_001/alerts').push();
    await alertRef.set({
      roomId: 'room_001',
      type: 'gas',
      severity: 'critical',
      value: 452,
      startedAt: 1_000,
    });

    const owner = await signedInDb('owner');
    const source = createFirebaseRoomDataSource(owner.db);

    await source.acknowledgeAlert('property_001', alertRef.key as string, owner.uid);

    const stored = (await adminDb.ref(`properties/property_001/alerts/${alertRef.key}`).get()).val();
    expect(stored.acknowledgedBy).toBe(owner.uid);
    expect(typeof stored.acknowledgedAt).toBe('number');

    const { ref: clientRef, update: clientUpdate } = await import('firebase/database');
    // forging someone else's acknowledgement is denied (.validate uid match)
    await expect(
      clientUpdate(
        clientRef(owner.db, `properties/property_001/alerts/${alertRef.key}`),
        { acknowledgedBy: 'someone-else' },
      ),
    ).rejects.toThrow(/permission/i);
    // editing any other field is denied (no write rule exists for it)
    await expect(
      clientUpdate(
        clientRef(owner.db, `properties/property_001/alerts/${alertRef.key}`),
        { value: 1 },
      ),
    ).rejects.toThrow(/permission/i);
  });

  it('mainRelay never surfaces through the subscription even if present in RTDB', async () => {
    await wipe();
    await seedTwoProperties();
    await adminDb
      .ref('properties/property_001/rooms/room_001/devices')
      .set({ lights: true, mainRelay: true });
    const owner = await signedInDb('owner');
    const source = createFirebaseRoomDataSource(owner.db);

    const emissions: DeviceCommands[] = [];
    const unsubscribe = source.subscribeDeviceCommands('property_001', 'room_001', (c) =>
      emissions.push(c),
    );
    await waitUntil(() => emissions.length >= 1);

    expect(emissions[0]).toEqual({ lights: true }); // mainRelay filtered
    unsubscribe();
  });
});
