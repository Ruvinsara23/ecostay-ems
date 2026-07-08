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

const { getAdminAuth, getAdminDatabase } = await import('./admin-app');
const { POST } = await import('@/app/api/admin/devices/route');

let appCounter = 0;

async function tokenFor(role: 'admin' | 'owner'): Promise<string> {
  const email = `devices-${role}-${appCounter}@ecostay.test`;
  const adminAuth = getAdminAuth();
  const user = await adminAuth.createUser({ email, password: 'seed-pass-1' });
  await adminAuth.setCustomUserClaims(user.uid, { role });
  const app = initClientApp({ apiKey: 'fake', projectId: PROJECT_ID }, `devices-client-${appCounter++}`);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, 'seed-pass-1');
  return auth.currentUser!.getIdToken(true);
}

function post(token: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return POST(
    new Request('http://localhost/api/admin/devices', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe('/api/admin/devices (emulator)', () => {
  beforeEach(async () => {
    await getAdminDatabase().ref().set(null);
  });

  it('creates and resets a device credential for an admin', async () => {
    const propertyId = `property_${appCounter}`;
    const roomId = `room_${appCounter}`;
    await getAdminDatabase().ref(`ops/roomIndex/${propertyId}/${roomId}`).set(true);

    const create = await post(await tokenFor('admin'), {
      action: 'create',
      propertyId,
      roomId,
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as { uid: string; email: string; password: string };
    expect(created.email).toBe(`device+${propertyId}+${roomId}@devices.ecostay.local`);
    expect(created.password.length).toBeGreaterThanOrEqual(16);

    const user = await getAdminAuth().getUser(created.uid);
    expect(user.customClaims).toMatchObject({ role: 'device', propertyId, roomId });
    expect(JSON.stringify((await getAdminDatabase().ref().get()).val())).not.toContain(
      created.password,
    );

    const reset = await post(await tokenFor('admin'), {
      action: 'resetPassword',
      propertyId,
      roomId,
    });
    expect(reset.status).toBe(200);
    const resetBody = (await reset.json()) as { uid: string; email: string; password: string };
    expect(resetBody.uid).toBe(created.uid);
    expect(resetBody.email).toBe(created.email);
    expect(resetBody.password).not.toBe(created.password);
    expect(JSON.stringify((await getAdminDatabase().ref().get()).val())).not.toContain(
      resetBody.password,
    );
  });

  it('denies an owner and refuses missing rooms or malformed ids', async () => {
    const owner = await post(await tokenFor('owner'), {
      action: 'create',
      propertyId: 'property_002',
      roomId: 'room_003',
    });
    expect(owner.status).toBe(403);

    const adminToken = await tokenFor('admin');
    const missing = await post(adminToken, {
      action: 'create',
      propertyId: 'property_ghost',
      roomId: 'room_003',
    });
    expect(missing.status).toBe(400);

    const malformed = await post(adminToken, {
      action: 'create',
      propertyId: 'BAD ID',
      roomId: 'room_003',
    });
    expect(malformed.status).toBe(400);
  });
});
