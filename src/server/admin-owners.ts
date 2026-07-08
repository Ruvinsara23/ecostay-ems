import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Database } from 'firebase-admin/database';
import type { CreateOwnerInput, ResetPasswordInput, SetDisabledInput } from './manage-owner';

export type OwnerSummary = {
  uid: string;
  email: string;
  disabled: boolean;
  propertyIds: string[];
};

/** A caller-fixable failure (bad target, duplicate email, missing property) → 400. */
export class OwnerOperationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'OwnerOperationError';
  }
}

function roleOf(user: UserRecord): unknown {
  return (user.customClaims as { role?: unknown } | undefined)?.role;
}

/**
 * Create an owner login and wire the tenancy records the exact way the seeder does
 * (CONTEXT.md Auth & tenancy): the `role: 'owner'` claim, the authority record
 * `properties/{pid}/members/{uid}`, and the one-read index `users/{uid}/properties/{pid}`.
 * Role is hardcoded `owner` — this route can never mint an admin.
 */
export async function createOwner(
  auth: Auth,
  db: Database,
  input: CreateOwnerInput,
): Promise<{ uid: string }> {
  // Assign only to a property that already exists (register a room first).
  if (!(await db.ref(`properties/${input.propertyId}`).get()).exists()) {
    throw new OwnerOperationError(
      'propertyId',
      `property "${input.propertyId}" does not exist — register a room first`,
    );
  }

  let user: UserRecord;
  try {
    user = await auth.createUser({ email: input.email, password: input.password });
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/email-already-exists') {
      throw new OwnerOperationError('email', 'an account with that email already exists');
    }
    throw error;
  }

  await auth.setCustomUserClaims(user.uid, { role: 'owner' });
  await db.ref().update({
    [`properties/${input.propertyId}/members/${user.uid}`]: 'owner',
    [`users/${user.uid}/properties/${input.propertyId}`]: true,
  });
  return { uid: user.uid };
}

async function requireOwnerByUid(auth: Auth, uid: string): Promise<UserRecord> {
  const user = await auth.getUser(uid).catch((error: unknown) => {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      throw new OwnerOperationError('uid', 'no such account');
    }
    throw error;
  });
  if (roleOf(user) !== 'owner') {
    throw new OwnerOperationError('uid', 'target is not an owner account');
  }
  return user;
}

/** Disable/enable an owner login. Refuses non-owner targets (can't lock out an admin). */
export async function setOwnerDisabled(auth: Auth, input: SetDisabledInput): Promise<void> {
  await requireOwnerByUid(auth, input.uid);
  await auth.updateUser(input.uid, { disabled: input.disabled });
}

/**
 * Generate a password-reset link for an owner. No email service is configured, so the
 * link is returned to the admin to hand over. Refuses non-owner targets.
 */
export async function resetOwnerPassword(
  auth: Auth,
  input: ResetPasswordInput,
): Promise<{ resetLink: string }> {
  const user = await auth.getUserByEmail(input.email).catch((error: unknown) => {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      throw new OwnerOperationError('email', 'no such account');
    }
    throw error;
  });
  if (roleOf(user) !== 'owner') {
    throw new OwnerOperationError('email', 'target is not an owner account');
  }
  return { resetLink: await auth.generatePasswordResetLink(input.email) };
}

/** List every owner account with its email, disabled flag, and assigned properties. */
export async function listOwners(auth: Auth, db: Database): Promise<OwnerSummary[]> {
  const owners: OwnerSummary[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (roleOf(user) !== 'owner') continue;
      const properties = (await db.ref(`users/${user.uid}/properties`).get()).val() as Record<
        string,
        true
      > | null;
      owners.push({
        uid: user.uid,
        email: user.email ?? '',
        disabled: user.disabled,
        propertyIds: Object.keys(properties ?? {}).sort(),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  owners.sort((a, b) => a.email.localeCompare(b.email));
  return owners;
}
