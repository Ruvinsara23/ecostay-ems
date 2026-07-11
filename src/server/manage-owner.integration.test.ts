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
const { GET, POST } = await import('@/app/api/admin/owners/route');

const PROPERTY_ID = 'property_002';
let appCounter = 0;

async function tokenFor(role: 'admin' | 'owner', email = `owners-${role}@ecostay.test`): Promise<string> {
  const adminAuth = getAdminAuth();
  const user = await adminAuth.createUser({ email, password: 'seed-pass-1' }).catch(async (e: unknown) => {
    if ((e as { code?: string }).code === 'auth/email-already-exists') return adminAuth.getUserByEmail(email);
    throw e;
  });
  await adminAuth.setCustomUserClaims(user.uid, { role });
  const app = initClientApp({ apiKey: 'fake', projectId: PROJECT_ID }, `owners-client-${appCounter++}`);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, 'seed-pass-1');
  return auth.currentUser!.getIdToken(true);
}

function req(method: 'GET' | 'POST', token: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/admin/owners', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/admin/owners (emulator)', () => {
  beforeEach(async () => {
    await getAdminDatabase().ref().set(null);
    // A property must exist before an owner can be assigned to it (register a room first).
    await getAdminDatabase().ref(`properties/${PROPERTY_ID}/name`).set('Lagoon Villa');
  });

  it('creates an owner: role claim + both tenancy records, then lists + disables + resets', async () => {
    const adminToken = await tokenFor('admin');
    const email = `new-owner-${appCounter}@ecostay.test`;

    const created = await POST(req('POST', adminToken, { action: 'create', email, password: 'brand-new-pass', propertyId: PROPERTY_ID }));
    expect(created.status).toBe(200);
    const { uid } = (await created.json()) as { uid: string };
    expect(uid).toBeTruthy();

    const adminAuth = getAdminAuth();
    const db = getAdminDatabase();
    const record = await adminAuth.getUser(uid);
    expect((record.customClaims as { role?: string }).role).toBe('owner');
    expect((await db.ref(`properties/${PROPERTY_ID}/members/${uid}`).get()).val()).toBe('owner');
    expect((await db.ref(`users/${uid}/properties/${PROPERTY_ID}`).get()).val()).toBe(true);

    const listed = await GET(req('GET', adminToken));
    const { owners } = (await listed.json()) as { owners: Array<{ email: string; disabled: boolean; propertyIds: string[] }> };
    const mine = owners.find((o) => o.email === email);
    expect(mine).toMatchObject({ disabled: false, propertyIds: [PROPERTY_ID] });

    const disabled = await POST(req('POST', adminToken, { action: 'setDisabled', uid, disabled: true }));
    expect(disabled.status).toBe(200);
    expect((await adminAuth.getUser(uid)).disabled).toBe(true);

    const reset = await POST(req('POST', adminToken, { action: 'resetPassword', email }));
    expect(reset.status).toBe(200);
    const resetBody = (await reset.json()) as { resetLink: string };
    expect(resetBody.resetLink).toContain('http');
  });

  it('denies a non-admin (403) and refuses non-owner targets / duplicates / missing property', async () => {
    const ownerToken = await tokenFor('owner');
    const forbidden = await POST(req('POST', ownerToken, { action: 'create', email: 'x@y.co', password: 'brand-new-pass', propertyId: PROPERTY_ID }));
    expect(forbidden.status).toBe(403);

    const adminToken = await tokenFor('admin');
    // Disabling the admin's own (non-owner) account must be refused.
    const adminUid = (await getAdminAuth().getUserByEmail('owners-admin@ecostay.test')).uid;
    const refusal = await POST(req('POST', adminToken, { action: 'setDisabled', uid: adminUid, disabled: true }));
    expect(refusal.status).toBe(400);

    // Missing property.
    const noProp = await POST(req('POST', adminToken, { action: 'create', email: 'z@y.co', password: 'brand-new-pass', propertyId: 'property_ghost' }));
    expect(noProp.status).toBe(400);

    // Duplicate email.
    const dupEmail = `dup-${appCounter}@ecostay.test`;
    await POST(req('POST', adminToken, { action: 'create', email: dupEmail, password: 'brand-new-pass', propertyId: PROPERTY_ID }));
    const dup = await POST(req('POST', adminToken, { action: 'create', email: dupEmail, password: 'brand-new-pass', propertyId: PROPERTY_ID }));
    expect(dup.status).toBe(400);
  });

  it('rejects a missing token (401) and unknown action (400)', async () => {
    expect((await POST(req('POST', null, { action: 'create' }))).status).toBe(401);
    expect((await GET(req('GET', null))).status).toBe(401);
    const adminToken = await tokenFor('admin');
    expect((await POST(req('POST', adminToken, { action: 'frobnicate' }))).status).toBe(400);
  });
});

describe('/api/admin/owners assign/unassign (slice 06 member writes, emulator)', () => {
  it('assign grants both tenancy records and real read access; unassign revokes both', async () => {
    const adminToken = await tokenFor('admin');
    const db = getAdminDatabase();
    await db.ref('properties/property_003/name').set('Second Villa');

    // Create an owner on property_002, then assign them to property_003 too.
    const email = `assignee-${appCounter}@ecostay.test`;
    const created = await POST(
      req('POST', adminToken, { action: 'create', email, password: 'brand-new-pass', propertyId: PROPERTY_ID }),
    );
    const { uid } = (await created.json()) as { uid: string };

    const assigned = await POST(req('POST', adminToken, { action: 'assign', uid, propertyId: 'property_003' }));
    expect(assigned.status).toBe(200);
    expect((await db.ref(`properties/property_003/members/${uid}`).get()).val()).toBe('owner');
    expect((await db.ref(`users/${uid}/properties/property_003`).get()).val()).toBe(true);

    // The assignment is real access under the PUBLISHED rules: the owner can read the property.
    const ownerApp = initClientApp({ apiKey: 'fake', projectId: PROJECT_ID }, `member-client-${appCounter++}`);
    const ownerAuth = getClientAuth(ownerApp);
    connectAuthEmulator(ownerAuth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
    await signInWithEmailAndPassword(ownerAuth, email, 'brand-new-pass');
    const { getDatabase: getClientDb, connectDatabaseEmulator, ref: clientRef, get: clientGet } =
      await import('firebase/database');
    const clientDb = getClientDb(ownerApp, `http://${DB_EMULATOR}?ns=${NAMESPACE}`);
    connectDatabaseEmulator(clientDb, '127.0.0.1', 9000);
    const read = await clientGet(clientRef(clientDb, 'properties/property_003/name'));
    expect(read.val()).toBe('Second Villa');

    // Duplicate assignment is refused.
    const dup = await POST(req('POST', adminToken, { action: 'assign', uid, propertyId: 'property_003' }));
    expect(dup.status).toBe(400);

    // Unassign: both records gone, and the same read is now DENIED by the rules.
    const removed = await POST(req('POST', adminToken, { action: 'unassign', uid, propertyId: 'property_003' }));
    expect(removed.status).toBe(200);
    expect((await db.ref(`properties/property_003/members/${uid}`).get()).exists()).toBe(false);
    expect((await db.ref(`users/${uid}/properties/property_003`).get()).exists()).toBe(false);
    await ownerAuth.currentUser!.getIdToken(true); // refresh so rules see current membership
    await expect(clientGet(clientRef(clientDb, 'properties/property_003/name'))).rejects.toThrow(
      /permission/i,
    );

    // Removing a non-member and assigning to a ghost property are caller errors.
    expect((await POST(req('POST', adminToken, { action: 'unassign', uid, propertyId: 'property_003' }))).status).toBe(400);
    expect((await POST(req('POST', adminToken, { action: 'assign', uid, propertyId: 'property_ghost' }))).status).toBe(400);
  });

  it('denies assign/unassign to non-admins', async () => {
    const ownerToken = await tokenFor('owner');
    const res = await POST(req('POST', ownerToken, { action: 'assign', uid: 'whatever', propertyId: PROPERTY_ID }));
    expect(res.status).toBe(403);
  });
});
