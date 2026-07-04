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
import type { RoomLatest } from './room-data-source';
import { createFirebaseRoomDataSource } from './firebase-room-data-source';

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

/** Provision an owner with membership, sign them in, return their client Database. */
async function signedInOwnerDb() {
  const user = await adminAuth.createUser({
    email: 'owner@ecostay.test',
    password: 'owner-pass-1',
  });
  await adminAuth.setCustomUserClaims(user.uid, { role: 'owner' });
  await adminDb.ref().update({
    [`properties/property_001/members/${user.uid}`]: 'owner',
    [`users/${user.uid}/properties/property_001`]: true,
  });

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
  await signInWithEmailAndPassword(auth, 'owner@ecostay.test', 'owner-pass-1');
  return db;
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
