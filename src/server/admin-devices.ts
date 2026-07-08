import { randomBytes } from 'node:crypto';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Database } from 'firebase-admin/database';
import {
  deviceAccountClaims,
  deviceEmailForRoom,
  type DeviceAccountInput,
  type DeviceCredential,
} from './manage-device';

export class DeviceAccountError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'DeviceAccountError';
  }
}

type PasswordGenerator = () => string;

function defaultPassword(): string {
  return randomBytes(24).toString('base64url');
}

function isFirebaseError(error: unknown, code: string): boolean {
  return (error as { code?: string }).code === code;
}

function claimsMatchDevice(user: UserRecord, input: DeviceAccountInput): boolean {
  const claims = user.customClaims as
    | { role?: unknown; propertyId?: unknown; roomId?: unknown }
    | undefined;
  return claims?.role === 'device' && claims.propertyId === input.propertyId && claims.roomId === input.roomId;
}

async function requireRegisteredRoom(db: Database, input: DeviceAccountInput): Promise<void> {
  const registered = await db.ref(`ops/roomIndex/${input.propertyId}/${input.roomId}`).get();
  if (registered.val() !== true) {
    throw new DeviceAccountError(
      'roomId',
      `room "${input.roomId}" is not registered for property "${input.propertyId}"`,
    );
  }
}

function credentialFor(user: UserRecord, input: DeviceAccountInput, password: string): DeviceCredential {
  return {
    uid: user.uid,
    email: deviceEmailForRoom(input),
    password,
  };
}

export async function createDeviceAccount(
  auth: Auth,
  db: Database,
  input: DeviceAccountInput,
  generatePassword: PasswordGenerator = defaultPassword,
): Promise<DeviceCredential> {
  await requireRegisteredRoom(db, input);

  const email = deviceEmailForRoom(input);
  const password = generatePassword();
  let user: UserRecord;
  try {
    user = await auth.createUser({ email, password });
  } catch (error) {
    if (isFirebaseError(error, 'auth/email-already-exists')) {
      throw new DeviceAccountError('roomId', 'device account already exists - reset password instead');
    }
    throw error;
  }

  await auth.setCustomUserClaims(user.uid, deviceAccountClaims(input));
  return credentialFor(user, input, password);
}

export async function resetDeviceCredential(
  auth: Auth,
  db: Database,
  input: DeviceAccountInput,
  generatePassword: PasswordGenerator = defaultPassword,
): Promise<DeviceCredential> {
  await requireRegisteredRoom(db, input);

  const email = deviceEmailForRoom(input);
  const user = await auth.getUserByEmail(email).catch((error: unknown) => {
    if (isFirebaseError(error, 'auth/user-not-found')) {
      throw new DeviceAccountError('roomId', 'no device account exists for this room');
    }
    throw error;
  });
  if (!claimsMatchDevice(user, input)) {
    throw new DeviceAccountError('roomId', 'target is not the device account for this room');
  }

  const password = generatePassword();
  const updated = await auth.updateUser(user.uid, { password });
  await auth.setCustomUserClaims(user.uid, deviceAccountClaims(input));
  return credentialFor(updated, input, password);
}
