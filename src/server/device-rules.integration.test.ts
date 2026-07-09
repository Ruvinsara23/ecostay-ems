// RTDB rules test for ADR-0007 slice 02: `npm run test:integration`.
import { readFileSync } from 'node:fs';
import { deleteApp, FirebaseApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  push,
  ref,
  remove,
  set,
} from 'firebase/database';
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

const LATEST = {
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

const HISTORY = {
  roomId: 'room_009',
  flowRate: 1.2,
  deltaLiters: 0.4,
  totalLiters: 8.6,
  temperature: 27.5,
  humidity: 62,
  createdAt: 1_751_600_000_000,
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

function clientApp(name: string) {
  const app = initializeApp(
    {
      apiKey: 'fake-emulator-key',
      projectId: PROJECT_ID,
      databaseURL: `https://${NAMESPACE}.firebaseio.com`,
    },
    `${name}-${appCounter++}`,
  );
  liveApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, DB_EMULATOR_HOST, DB_EMULATOR_PORT);
  return { auth, db };
}

async function signedInDeviceDb(claims: Record<string, unknown>) {
  const email = `device-rules-${appCounter}@ecostay.test`;
  const password = 'device-pass-1';
  const user = await adminAuth.createUser({ email, password });
  await adminAuth.setCustomUserClaims(user.uid, claims);

  const { auth, db } = clientApp('device-rules');
  await signInWithEmailAndPassword(auth, email, password);
  await auth.currentUser!.getIdToken(true);
  return db;
}

async function anonymousDb() {
  const { auth, db } = clientApp('anonymous-device');
  await signInAnonymously(auth);
  return db;
}

async function createHistory(
  db: ReturnType<typeof getDatabase>,
  propertyId: string,
  body: Record<string, unknown>,
) {
  const entry = push(ref(db, `properties/${propertyId}/history`));
  await set(entry, body);
  return entry;
}

beforeEach(async () => {
  await wipe();
});

afterEach(async () => {
  await Promise.all(liveApps.splice(0).map((app) => deleteApp(app)));
});

describe('device-scoped RTDB rules', () => {
  it('allows a matching device account to write its own latest snapshot', async () => {
    const db = await signedInDeviceDb({
      role: 'device',
      propertyId: 'property_002',
      roomId: 'room_009',
    });

    await set(ref(db, 'properties/property_002/rooms/room_009/latest'), LATEST);

    expect(
      (await adminDb.ref('properties/property_002/rooms/room_009/latest/power').get()).val(),
    ).toBe(4.7);
  });

  it('allows a matching device account to append property-level history only for its room', async () => {
    const db = await signedInDeviceDb({
      role: 'device',
      propertyId: 'property_002',
      roomId: 'room_009',
    });

    const created = await createHistory(db, 'property_002', HISTORY);
    expect(
      (await adminDb.ref(`properties/property_002/history/${created.key}/roomId`).get()).val(),
    ).toBe('room_009');

    await expect(set(created, { ...HISTORY, flowRate: 2.4 })).rejects.toThrow(/permission/i);
    await expect(remove(created)).rejects.toThrow(/permission/i);
    await expect(
      createHistory(db, 'property_002', { ...HISTORY, roomId: 'room_010' }),
    ).rejects.toThrow(/permission/i);
    await expect(
      createHistory(db, 'property_002', { flowRate: 1.2, createdAt: 1_751_600_000_000 }),
    ).rejects.toThrow(/permission/i);
  });

  it('allows a matching device account to read commands but not write them', async () => {
    await adminDb
      .ref('properties/property_002/rooms/room_009/devices')
      .set({ lights: true, exhaustFan: false });
    const db = await signedInDeviceDb({
      role: 'device',
      propertyId: 'property_002',
      roomId: 'room_009',
    });

    expect((await get(ref(db, 'properties/property_002/rooms/room_009/devices'))).val()).toEqual({
      lights: true,
      exhaustFan: false,
    });
    await expect(
      set(ref(db, 'properties/property_002/rooms/room_009/devices/lights'), false),
    ).rejects.toThrow(/permission/i);
  });

  it('denies device accounts outside their exact property and room claim scope', async () => {
    const db = await signedInDeviceDb({
      role: 'device',
      propertyId: 'property_002',
      roomId: 'room_009',
    });

    await expect(
      set(ref(db, 'properties/property_002/rooms/room_010/latest'), LATEST),
    ).rejects.toThrow(/permission/i);
    await expect(
      set(ref(db, 'properties/property_003/rooms/room_009/latest'), LATEST),
    ).rejects.toThrow(/permission/i);
    await expect(
      get(ref(db, 'properties/property_002/rooms/room_010/devices')),
    ).rejects.toThrow(/permission/i);
  });

  it('denies device accounts missing matching propertyId and roomId claims', async () => {
    const db = await signedInDeviceDb({ role: 'device' });

    await expect(
      set(ref(db, 'properties/property_002/rooms/room_009/latest'), LATEST),
    ).rejects.toThrow(/permission/i);
    await expect(
      get(ref(db, 'properties/property_002/rooms/room_009/devices')),
    ).rejects.toThrow(/permission/i);
  });

  it('supports device credentials for non-bench rooms under property_001', async () => {
    await adminDb
      .ref('properties/property_001/rooms/room_002/devices')
      .set({ lights: false, waterPump: true });
    const db = await signedInDeviceDb({
      role: 'device',
      propertyId: 'property_001',
      roomId: 'room_002',
    });

    await set(ref(db, 'properties/property_001/rooms/room_002/latest'), LATEST);

    expect(
      (await adminDb.ref('properties/property_001/rooms/room_002/latest/power').get()).val(),
    ).toBe(4.7);
    expect((await get(ref(db, 'properties/property_001/rooms/room_002/devices'))).val()).toEqual({
      lights: false,
      waterPump: true,
    });
  });

  it('preserves the transitional anonymous bench-room bridge until cutover', async () => {
    const db = await anonymousDb();

    await set(ref(db, 'properties/property_001/rooms/room_001/latest'), LATEST);
    const created = await createHistory(db, 'property_001', { ...HISTORY, roomId: 'room_001' });
    expect(
      (await adminDb.ref(`properties/property_001/history/${created.key}/roomId`).get()).val(),
    ).toBe('room_001');
    await expect(
      set(ref(db, 'properties/property_001/rooms/room_002/latest'), LATEST),
    ).rejects.toThrow(/permission/i);
    await expect(
      set(ref(db, 'properties/property_002/rooms/room_001/latest'), LATEST),
    ).rejects.toThrow(/permission/i);
  });

  it('preserves sampledAt indexes used by dashboard history queries', () => {
    const rules = JSON.parse(readFileSync('database.rules.json', 'utf8')) as {
      rules: {
        properties: {
          property_001: { energyHistory: { $roomId: { '.indexOn': string } } };
          $propertyId: { energyHistory: { $roomId: { '.indexOn': string } } };
        };
      };
    };

    expect(rules.rules.properties.property_001.energyHistory.$roomId['.indexOn']).toBe(
      'sampledAt',
    );
    expect(rules.rules.properties.$propertyId.energyHistory.$roomId['.indexOn']).toBe(
      'sampledAt',
    );
  });
});
