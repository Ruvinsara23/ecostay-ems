// Dev/bootstrap seeder — NOT product code (see scripts/README.md).
//
// Creates (or updates) a dashboard account with a role claim and, for owners,
// the tenancy records for the bench node's property/room (firmware contract:
// property_001/room_001). Run by a human with Admin SDK credentials:
//
//   node scripts/seed.ts --email owner@example.com --password "..." --role owner
//
// Requires GOOGLE_APPLICATION_CREDENTIALS (service-account JSON path) for the
// real project, or FIREBASE_AUTH_EMULATOR_HOST/FIREBASE_DATABASE_EMULATOR_HOST
// to seed emulators. Database URL comes from FIREBASE_DATABASE_URL or .env.local.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

const PROPERTY_ID = 'property_001'; // hardcoded in firmware until ADR-0007 provisioning lands
const ROOM_ID = 'room_001';

type Args = {
  email: string;
  password: string;
  role: 'owner' | 'admin';
  propertyName: string;
  roomName: string;
};

function fail(message: string): never {
  console.error(`seed: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      fail(`malformed arguments near "${flag ?? ''}"`);
    }
    values.set(flag.slice(2), value);
  }
  const email = values.get('email') ?? fail('--email is required');
  const password = values.get('password') ?? fail('--password is required');
  const role = values.get('role') ?? 'owner';
  if (role !== 'owner' && role !== 'admin') {
    fail(`--role must be "owner" or "admin", got "${role}"`);
  }
  return {
    email,
    password,
    role,
    propertyName: values.get('property-name') ?? 'EcoStay Property',
    roomName: values.get('room-name') ?? 'Room 1',
  };
}

/** Minimal .env.local reader so the seeder shares the dashboard's database URL. */
function readEnvLocal(key: string): string | undefined {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && match[1] === key) return match[2];
  }
  return undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ?? readEnvLocal('NEXT_PUBLIC_FIREBASE_DATABASE_URL');
  if (!databaseURL) {
    fail(
      'no database URL — set FIREBASE_DATABASE_URL or NEXT_PUBLIC_FIREBASE_DATABASE_URL in .env.local',
    );
  }

  const usingEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !usingEmulators) {
    fail(
      'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at a service-account JSON ' +
        '(kept OUTSIDE the repo — never commit it), or set the emulator host vars.',
    );
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? readEnvLocal('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  const app = initializeApp({
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS ? applicationDefault() : undefined,
    databaseURL,
    projectId,
  });

  const auth = getAuth(app);
  const existing = await auth.getUserByEmail(args.email).catch((error: unknown) => {
    if ((error as { code?: string }).code === 'auth/user-not-found') return null;
    throw error;
  });

  const user = existing
    ? await auth.updateUser(existing.uid, { password: args.password })
    : await auth.createUser({ email: args.email, password: args.password });
  await auth.setCustomUserClaims(user.uid, { role: args.role });
  console.log(
    `seed: ${existing ? 'updated' : 'created'} ${args.role} account ${args.email} (uid ${user.uid})`,
  );

  const db = getDatabase(app);
  // Room registry for the server workloads (ADR-0010) — Admin-only path.
  await db.ref(`ops/roomIndex/${PROPERTY_ID}/${ROOM_ID}`).set(true);
  // Names are set only when absent so a later Admin-UI rename is never clobbered.
  const propertyNameRef = db.ref(`properties/${PROPERTY_ID}/name`);
  if ((await propertyNameRef.get()).val() === null) {
    await propertyNameRef.set(args.propertyName);
  }
  const roomNameRef = db.ref(`properties/${PROPERTY_ID}/rooms/${ROOM_ID}/name`);
  if ((await roomNameRef.get()).val() === null) {
    await roomNameRef.set(args.roomName);
  }

  if (args.role === 'owner') {
    await db.ref().update({
      [`properties/${PROPERTY_ID}/members/${user.uid}`]: 'owner',
      [`users/${user.uid}/properties/${PROPERTY_ID}`]: true,
    });
    console.log(`seed: linked ${args.email} to ${PROPERTY_ID}/${ROOM_ID} as owner`);
  } else {
    console.log('seed: admin role bypasses membership — no tenancy records written');
  }

  console.log('seed: done');
  process.exit(0);
}

main().catch((error) => {
  console.error('seed: failed —', error);
  process.exit(1);
});
