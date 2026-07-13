// RTDB rules test for FCM token registration (audit #1): a signed-in user must be
// able to persist their OWN push token, and nothing else under users/{uid}.
// `npm run test:integration`.
import { deleteApp, FirebaseApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, ref, set } from 'firebase/database';
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

async function signedInOwner() {
  const email = `fcm-rules-${appCounter}@ecostay.test`;
  const user = await adminAuth.createUser({ email, password: 'owner-pass-1' });
  await adminAuth.setCustomUserClaims(user.uid, { role: 'owner' });

  const app = initializeApp(
    { apiKey: 'fake-emulator-key', projectId: PROJECT_ID, databaseURL: `https://${NAMESPACE}.firebaseio.com` },
    `fcm-rules-${appCounter++}`,
  );
  liveApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, DB_EMULATOR_HOST, DB_EMULATOR_PORT);
  await signInWithEmailAndPassword(auth, email, 'owner-pass-1');
  await auth.currentUser!.getIdToken(true);
  return { db, uid: user.uid };
}

beforeEach(async () => {
  await wipe();
});

afterEach(async () => {
  await Promise.all(liveApps.splice(0).map((app) => deleteApp(app)));
});

describe('fcmTokens RTDB rules', () => {
  it('lets a signed-in user register and read back their own push token', async () => {
    const { db, uid } = await signedInOwner();

    await set(ref(db, `users/${uid}/fcmTokens/sanitized_key`), 'raw-fcm-token');

    expect((await get(ref(db, `users/${uid}/fcmTokens/sanitized_key`))).val()).toBe('raw-fcm-token');
    expect((await adminDb.ref(`users/${uid}/fcmTokens/sanitized_key`).get()).val()).toBe(
      'raw-fcm-token',
    );
  });

  it('rejects a non-string token value', async () => {
    const { db, uid } = await signedInOwner();
    await expect(set(ref(db, `users/${uid}/fcmTokens/bad`), { nested: true })).rejects.toThrow(
      /permission/i,
    );
  });

  it('denies writing another user’s tokens', async () => {
    const { db } = await signedInOwner();
    const other = await adminAuth.createUser({ email: 'other@ecostay.test', password: 'x-pass-1' });
    await expect(
      set(ref(db, `users/${other.uid}/fcmTokens/key`), 'stolen'),
    ).rejects.toThrow(/permission/i);
  });

  it('keeps the rest of users/{uid} Admin-SDK-only (no client write to the property index)', async () => {
    const { db, uid } = await signedInOwner();
    await expect(set(ref(db, `users/${uid}/properties/property_001`), true)).rejects.toThrow(
      /permission/i,
    );
  });
});
