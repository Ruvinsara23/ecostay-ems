// Full-route test against Auth + RTDB emulators: `npm run test:integration`.
import { initializeApp as initClientApp } from 'firebase/app';
import { connectAuthEmulator, getAuth as getClientAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { beforeEach, describe, expect, it } from 'vitest';

const AUTH_EMULATOR = '127.0.0.1:9099';
const DB_EMULATOR = '127.0.0.1:9000';
const PROJECT_ID = 'demo-ecostay';
const NAMESPACE = `${PROJECT_ID}-default-rtdb`;

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = DB_EMULATOR;
process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.FIREBASE_DATABASE_URL = `http://${DB_EMULATOR}/?ns=${NAMESPACE}`;

// Imported after the emulator env is set so the admin app initializes in emulator mode.
const { getAdminAuth, getAdminDatabase } = await import('./admin-app');
const { POST } = await import('@/app/api/admin/rooms/register/route');

let appCounter = 0;

async function tokenFor(role: 'admin' | 'owner'): Promise<string> {
  const email = `reg-${role}@ecostay.test`;
  const adminAuth = getAdminAuth();
  const user = await adminAuth
    .createUser({ email, password: 'reg-pass-1' })
    .catch(async (e: unknown) => {
      if ((e as { code?: string }).code === 'auth/email-already-exists') {
        return adminAuth.getUserByEmail(email);
      }
      throw e;
    });
  await adminAuth.setCustomUserClaims(user.uid, { role });

  const app = initClientApp({ apiKey: 'fake', projectId: PROJECT_ID }, `reg-client-${appCounter++}`);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, 'reg-pass-1');
  return auth.currentUser!.getIdToken(true); // force refresh so the fresh role claim is included
}

function post(token: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return POST(
    new Request('http://localhost/api/admin/rooms/register', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/admin/rooms/register (emulator)', () => {
  beforeEach(async () => {
    await getAdminDatabase().ref().set(null);
  });

  it('registers a room for an admin — writes ops/roomIndex + names', async () => {
    const res = await post(await tokenFor('admin'), {
      propertyId: 'property_002',
      roomId: 'room_009',
      roomName: 'Garden Room',
      propertyName: 'Lagoon Villa',
    });
    expect(res.status).toBe(200);

    const db = getAdminDatabase();
    expect((await db.ref('ops/roomIndex/property_002/room_009').get()).val()).toBe(true);
    expect((await db.ref('properties/property_002/rooms/room_009/name').get()).val()).toBe('Garden Room');
    expect((await db.ref('properties/property_002/name').get()).val()).toBe('Lagoon Villa');
  });

  it('denies a non-admin with 403 and writes nothing', async () => {
    const res = await post(await tokenFor('owner'), {
      propertyId: 'property_002',
      roomId: 'room_010',
      roomName: 'Denied',
    });
    expect(res.status).toBe(403);
    expect((await getAdminDatabase().ref('ops/roomIndex/property_002/room_010').get()).val()).toBeNull();
  });

  it('rejects a missing token (401) and a malformed id (400)', async () => {
    expect((await post(null, { propertyId: 'p', roomId: 'r', roomName: 'X' })).status).toBe(401);
    const res = await post(await tokenFor('admin'), {
      propertyId: 'BAD ID',
      roomId: 'r',
      roomName: 'X',
    });
    expect(res.status).toBe(400);
  });
});
