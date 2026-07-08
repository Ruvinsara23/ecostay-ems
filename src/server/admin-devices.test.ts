import { describe, expect, it, vi } from 'vitest';
import { createDeviceAccount, resetDeviceCredential } from './admin-devices';

type FakeUser = {
  uid: string;
  email: string;
  password: string;
  customClaims?: Record<string, unknown>;
};

function makeAuth() {
  const users = new Map<string, FakeUser>();
  let nextUid = 1;
  return {
    users,
    async createUser({ email, password }: { email: string; password: string }) {
      if (users.has(email)) {
        const error = new Error('exists') as Error & { code?: string };
        error.code = 'auth/email-already-exists';
        throw error;
      }
      const user: FakeUser = { uid: `uid-${nextUid++}`, email, password };
      users.set(email, user);
      return user;
    },
    async getUserByEmail(email: string) {
      const user = users.get(email);
      if (!user) {
        const error = new Error('missing') as Error & { code?: string };
        error.code = 'auth/user-not-found';
        throw error;
      }
      return user;
    },
    async updateUser(uid: string, update: { password?: string }) {
      const user = [...users.values()].find((u) => u.uid === uid);
      if (!user) throw new Error('missing uid');
      if (update.password) user.password = update.password;
      return user;
    },
    async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
      const user = [...users.values()].find((u) => u.uid === uid);
      if (!user) throw new Error('missing uid');
      user.customClaims = claims;
    },
  };
}

function makeDb(registered = true) {
  return {
    ref(path = '') {
      return {
        async get() {
          return {
            val: () => (path === 'ops/roomIndex/property_002/room_003' && registered ? true : null),
          };
        },
      };
    },
  };
}

describe('device account provisioning', () => {
  it('creates a device account scoped to an existing room and returns the credential once', async () => {
    const auth = makeAuth();
    const db = makeDb();
    const result = await createDeviceAccount(
      auth as never,
      db as never,
      { propertyId: 'property_002', roomId: 'room_003' },
      () => 'generated-device-pass',
    );

    expect(result).toEqual({
      uid: 'uid-1',
      email: 'device+property_002+room_003@devices.ecostay.local',
      password: 'generated-device-pass',
    });
    expect(auth.users.get(result.email)?.customClaims).toEqual({
      role: 'device',
      propertyId: 'property_002',
      roomId: 'room_003',
    });
  });

  it('refuses a room that has not been registered', async () => {
    await expect(
      createDeviceAccount(
        makeAuth() as never,
        makeDb(false) as never,
        { propertyId: 'property_002', roomId: 'room_003' },
        () => 'generated-device-pass',
      ),
    ).rejects.toMatchObject({ field: 'roomId' });
  });

  it('resets an existing matching device credential without creating RTDB state', async () => {
    const auth = makeAuth();
    const db = makeDb();
    const created = await createDeviceAccount(
      auth as never,
      db as never,
      { propertyId: 'property_002', roomId: 'room_003' },
      () => 'first-device-pass',
    );

    const reset = await resetDeviceCredential(
      auth as never,
      db as never,
      { propertyId: 'property_002', roomId: 'room_003' },
      () => 'second-device-pass',
    );

    expect(reset).toEqual({ ...created, password: 'second-device-pass' });
    expect(auth.users.get(created.email)?.password).toBe('second-device-pass');
  });

  it('does not log generated credentials', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createDeviceAccount(
      makeAuth() as never,
      makeDb() as never,
      { propertyId: 'property_002', roomId: 'room_003' },
      () => 'do-not-log-this-password',
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
