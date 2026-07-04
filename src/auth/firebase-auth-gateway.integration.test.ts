// Runs against the Firebase Auth emulator: `npm run test:integration`.
// Proves the real adapter obeys the same AuthGateway contract as the fake,
// plus the adapter-only rule: anonymous (device) sign-in never yields a session.
import { deleteApp, initializeApp } from 'firebase/app';
import {
  Auth,
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
} from 'firebase/auth';
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { afterEach, describe, expect, it } from 'vitest';
import { authGatewayContract } from './auth-gateway-contract';
import type { Role, Session } from './auth-gateway';
import { createFirebaseAuthGateway } from './firebase-auth-gateway';

const PROJECT_ID = 'demo-ecostay';
const EMULATOR_HOST = '127.0.0.1:9099';

process.env.FIREBASE_AUTH_EMULATOR_HOST = EMULATOR_HOST;

const adminApp =
  getAdminApps()[0] ?? initializeAdminApp({ projectId: PROJECT_ID });
const adminAuth = getAdminAuth(adminApp);

async function wipeUsers() {
  const response = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error(`Failed to wipe emulator accounts: ${response.status}`);
  }
}

let appCounter = 0;
const liveAuths: Auth[] = [];

async function freshClientAuth(): Promise<Auth> {
  const app = initializeApp(
    { apiKey: 'fake-emulator-key', projectId: PROJECT_ID },
    `integration-${appCounter++}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}`, { disableWarnings: true });
  liveAuths.push(auth);
  return auth;
}

async function createUser(email: string, password: string, role?: Role) {
  const user = await adminAuth.createUser({ email, password });
  if (role) {
    await adminAuth.setCustomUserClaims(user.uid, { role });
  }
}

afterEach(async () => {
  await Promise.all(liveAuths.splice(0).map((auth) => deleteApp(auth.app)));
});

authGatewayContract(async () => {
  await wipeUsers();
  const auth = await freshClientAuth();
  return { gateway: createFirebaseAuthGateway(auth), createUser };
});

describe('FirebaseAuthGateway (adapter-specific)', () => {
  it('never yields a session for an anonymous (device) sign-in', async () => {
    await wipeUsers();
    const auth = await freshClientAuth();
    const gateway = createFirebaseAuthGateway(auth);

    const emissions: Array<Session | null> = [];
    const unsubscribe = gateway.observeSession((session) => emissions.push(session));

    await signInAnonymously(auth);
    // Give the observer time to (wrongly) emit a session if the mapping were broken.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(emissions.every((emission) => emission === null)).toBe(true);
    unsubscribe();
  });
});
