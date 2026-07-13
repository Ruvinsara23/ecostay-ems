import { describe, expect, it } from 'vitest';
import type { AlertRecord } from './alerts';
import { createNotificationsDeps, dispatchNotifications, type NotificationsDeps } from './notifications';

function alert(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    propertyId: 'property_001',
    roomId: 'room_001',
    type: 'gas',
    severity: 'critical',
    value: 420,
    startedAt: 1_752_000_000_000,
    ...overrides,
  } as AlertRecord;
}

type SendCall = { tokens: string[]; title: string; body: string };

function makeDeps(config?: {
  membersByProperty?: Record<string, Record<string, string> | null>;
  tokensByUid?: Record<string, Record<string, string | true> | null>;
  failTokens?: string[];
  readMembersThrowsFor?: string;
}) {
  const sends: SendCall[] = [];
  const removed: Array<{ uid: string; key: string }> = [];
  const membersByProperty = config?.membersByProperty ?? {
    property_001: { uid_a: 'owner' },
  };
  const tokensByUid = config?.tokensByUid ?? { uid_a: { key_1: 'token-1' } };
  const failTokens = new Set(config?.failTokens ?? []);

  const deps: NotificationsDeps = {
    async readMembers(propertyId) {
      if (propertyId === config?.readMembersThrowsFor) throw new Error('boom');
      return membersByProperty[propertyId] ?? null;
    },
    async readFcmTokens(uid) {
      return tokensByUid[uid] ?? null;
    },
    async removeFcmToken(uid, key) {
      removed.push({ uid, key });
    },
    async sendMulticast(tokens, notification) {
      sends.push({ tokens: [...tokens], title: notification.title, body: notification.body });
      // config.failTokens models tokens FCM reports as DEAD (prunable).
      const invalidTokens = tokens.filter((t) => failTokens.has(t));
      return {
        successCount: tokens.length - invalidTokens.length,
        failureCount: invalidTokens.length,
        invalidTokens,
      };
    },
  };
  return { deps, sends, removed };
}

describe('dispatchNotifications', () => {
  it('sends each new alert to every member token of its property', async () => {
    const { deps, sends } = makeDeps({
      membersByProperty: { property_001: { uid_a: 'owner', uid_b: 'owner' } },
      tokensByUid: { uid_a: { key_1: 'token-1' }, uid_b: { key_2: 'token-2' } },
    });

    const result = await dispatchNotifications(deps, [alert()]);

    expect(sends).toHaveLength(1);
    expect(sends[0].tokens.sort()).toEqual(['token-1', 'token-2']);
    expect(sends[0].title).toMatch(/gas/i);
    expect(sends[0].body).toMatch(/room_001/);
    expect(result.sent).toBe(2);
  });

  it('does nothing when the property has no members or no tokens', async () => {
    const none = makeDeps({ membersByProperty: { property_001: null } });
    await dispatchNotifications(none.deps, [alert()]);
    expect(none.sends).toHaveLength(0);

    const tokenless = makeDeps({ tokensByUid: { uid_a: null } });
    await dispatchNotifications(tokenless.deps, [alert()]);
    expect(tokenless.sends).toHaveLength(0);
  });

  it('chunks token lists to the FCM 500-token multicast limit', async () => {
    const tokens: Record<string, string> = {};
    for (let i = 0; i < 750; i++) tokens[`key_${i}`] = `token-${i}`;
    const { deps, sends } = makeDeps({ tokensByUid: { uid_a: tokens } });

    await dispatchNotifications(deps, [alert()]);

    expect(sends).toHaveLength(2);
    expect(sends[0].tokens).toHaveLength(500);
    expect(sends[1].tokens).toHaveLength(250);
  });

  it('prunes failed tokens and excludes them from subsequent alerts', async () => {
    const { deps, sends, removed } = makeDeps({
      tokensByUid: { uid_a: { key_good: 'token-good', key_bad: 'token-bad' } },
      failTokens: ['token-bad'],
    });

    await dispatchNotifications(deps, [alert(), alert({ type: 'temperature', value: 41 })]);

    expect(removed).toEqual([{ uid: 'uid_a', key: 'key_bad' }]);
    expect(sends).toHaveLength(2);
    expect(sends[1].tokens).toEqual(['token-good']);
  });

  it('falls back to the key for legacy true-valued token entries', async () => {
    const { deps, sends } = makeDeps({
      tokensByUid: { uid_a: { 'legacy-token': true } },
    });

    await dispatchNotifications(deps, [alert()]);

    expect(sends[0].tokens).toEqual(['legacy-token']);
  });

  it('a failing property does not block dispatch for other properties', async () => {
    const { deps, sends } = makeDeps({
      membersByProperty: {
        property_001: { uid_a: 'owner' },
        property_002: { uid_b: 'owner' },
      },
      tokensByUid: { uid_a: { k: 'token-a' }, uid_b: { k: 'token-b' } },
      readMembersThrowsFor: 'property_001',
    });

    const result = await dispatchNotifications(deps, [
      alert(),
      alert({ propertyId: 'property_002', roomId: 'room_009' }),
    ]);

    expect(sends).toHaveLength(1);
    expect(sends[0].tokens).toEqual(['token-b']);
    expect(result.sent).toBe(1);
  });
});

describe('createNotificationsDeps (RTDB adapter paths)', () => {
  function makeDb(data: Record<string, unknown>, requested: string[]) {
    return {
      ref(path = '') {
        requested.push(path);
        return {
          async once() {
            return { val: () => (path in data ? data[path] : null) };
          },
          async remove() {},
        };
      },
    };
  }

  it('reads members from properties/{pid}/members — not the nonexistent top-level members path', async () => {
    const requested: string[] = [];
    const db = makeDb({ 'properties/property_001/members': { uid_a: 'owner' } }, requested);
    const deps = createNotificationsDeps(db as never, { sendEachForMulticast: async () => ({ responses: [], successCount: 0, failureCount: 0 }) } as never);

    const members = await deps.readMembers('property_001');

    expect(requested).toContain('properties/property_001/members');
    expect(requested.some((p) => p === 'members/property_001')).toBe(false);
    expect(members).toEqual({ uid_a: 'owner' });
  });

  it('reads tokens from users/{uid}/fcmTokens', async () => {
    const requested: string[] = [];
    const db = makeDb({ 'users/uid_a/fcmTokens': { k: 'token-1' } }, requested);
    const deps = createNotificationsDeps(db as never, { sendEachForMulticast: async () => ({ responses: [], successCount: 0, failureCount: 0 }) } as never);

    const tokens = await deps.readFcmTokens('uid_a');

    expect(requested).toContain('users/uid_a/fcmTokens');
    expect(tokens).toEqual({ k: 'token-1' });
  });
});

describe('createNotificationsDeps.sendMulticast — token pruning safety', () => {
  function messagingStub(responses: Array<{ success: boolean; code?: string }>) {
    return {
      async sendEachForMulticast() {
        return {
          successCount: responses.filter((r) => r.success).length,
          failureCount: responses.filter((r) => !r.success).length,
          responses: responses.map((r) =>
            r.success ? { success: true } : { success: false, error: { code: r.code } },
          ),
        };
      },
    } as never;
  }

  it('reports ONLY dead tokens as invalid — transient failures keep their token', async () => {
    const deps = createNotificationsDeps({} as never, messagingStub([
      { success: true },
      { success: false, code: 'messaging/registration-token-not-registered' }, // dead
      { success: false, code: 'messaging/internal-error' }, // transient — must survive
      { success: false, code: 'messaging/quota-exceeded' }, // transient — must survive
    ]));

    const result = await deps.sendMulticast(['good', 'dead', 'blip', 'quota'], {
      title: 't',
      body: 'b',
    });

    expect(result.invalidTokens).toEqual(['dead']);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(3);
  });

  it('treats an unknown/absent error code as transient (never prunes on a guess)', async () => {
    const deps = createNotificationsDeps({} as never, messagingStub([{ success: false }]));
    const result = await deps.sendMulticast(['mystery'], { title: 't', body: 'b' });
    expect(result.invalidTokens).toEqual([]);
  });
});
