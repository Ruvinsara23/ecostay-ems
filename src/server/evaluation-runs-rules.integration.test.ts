// RTDB rules test for the §10.2 evaluation runs (owner/admin only, validated):
// `npm run test:integration`.
import { deleteApp, FirebaseApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, push, ref, set, update } from 'firebase/database';
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

const PID = 'property_002';
const RID = 'room_009';
const RUNS = `properties/${PID}/rooms/${RID}/evaluationRuns`;
const VALID_RUN = { label: 'baseline', automationEnabled: false, startedAt: 1_751_600_000_000, startEnergyKWh: 1.2 };

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
    { apiKey: 'fake-emulator-key', projectId: PROJECT_ID, databaseURL: `https://${NAMESPACE}.firebaseio.com` },
    `${name}-${appCounter++}`,
  );
  liveApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, DB_EMULATOR_HOST, DB_EMULATOR_PORT);
  return { auth, db };
}

async function signedInDb(claims: Record<string, unknown>, { member }: { member: boolean }) {
  const email = `eval-rules-${appCounter}@ecostay.test`;
  const user = await adminAuth.createUser({ email, password: 'owner-pass-1' });
  await adminAuth.setCustomUserClaims(user.uid, claims);
  if (member) await adminDb.ref(`properties/${PID}/members/${user.uid}`).set('owner');

  const { auth, db } = clientApp('eval-rules');
  await signInWithEmailAndPassword(auth, email, 'owner-pass-1');
  await auth.currentUser!.getIdToken(true);
  return db;
}

beforeEach(async () => {
  await wipe();
});

afterEach(async () => {
  await Promise.all(liveApps.splice(0).map((app) => deleteApp(app)));
});

describe('evaluation-runs RTDB rules', () => {
  it('lets a property member create, update, read and delete a run', async () => {
    const db = await signedInDb({ role: 'owner' }, { member: true });

    const runRef = push(ref(db, RUNS));
    await set(runRef, VALID_RUN);
    await update(runRef, { endedAt: 1_751_600_100_000, endEnergyKWh: 1.35 });

    expect((await get(ref(db, `${RUNS}/${runRef.key}/endEnergyKWh`))).val()).toBe(1.35);
    await set(runRef, null);
    expect((await adminDb.ref(`${RUNS}/${runRef.key}`).get()).val()).toBeNull();
  });

  it('lets an admin create a run', async () => {
    const db = await signedInDb({ role: 'admin' }, { member: false });
    await set(push(ref(db, RUNS)), VALID_RUN);
  });

  it('denies a non-member owner', async () => {
    const db = await signedInDb({ role: 'owner' }, { member: false });
    await expect(set(push(ref(db, RUNS)), VALID_RUN)).rejects.toThrow(/permission/i);
  });

  it('rejects an invalid label and any unknown field', async () => {
    const db = await signedInDb({ role: 'owner' }, { member: true });

    await expect(set(push(ref(db, RUNS)), { ...VALID_RUN, label: 'other' })).rejects.toThrow(
      /permission/i,
    );
    await expect(set(push(ref(db, RUNS)), { ...VALID_RUN, hacked: true })).rejects.toThrow(
      /permission/i,
    );
  });
});
