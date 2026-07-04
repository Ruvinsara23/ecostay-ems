// Shared behavioral contract for every AuthGateway implementation.
// Runs against the in-memory fake (unit) and the Firebase adapter (emulator integration),
// so the fake can never drift from the real thing.
import { describe, expect, it } from 'vitest';
import type { AuthGateway, Role, Session } from './auth-gateway';

export type AuthGatewayTestContext = {
  gateway: AuthGateway;
  /** Provision a user out-of-band (seed/admin path), optionally with a role claim. */
  createUser: (email: string, password: string, role?: Role) => Promise<void>;
};

type Emission = Session | null;

function recordSessions(gateway: AuthGateway) {
  const emissions: Emission[] = [];
  let waiters: Array<() => void> = [];
  const unsubscribe = gateway.observeSession((session) => {
    emissions.push(session);
    const toNotify = waiters;
    waiters = [];
    toNotify.forEach((notify) => notify());
  });
  return {
    emissions,
    unsubscribe,
    latest(): Emission | undefined {
      return emissions[emissions.length - 1];
    },
    /** Resolves once the most recent emission satisfies the predicate. */
    async waitFor(predicate: (latest: Emission | undefined) => boolean, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (!predicate(this.latest())) {
        if (Date.now() > deadline) {
          throw new Error(
            `Timed out waiting for session emission. Saw: ${JSON.stringify(emissions)}`,
          );
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 25);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
  };
}

export function authGatewayContract(setup: () => Promise<AuthGatewayTestContext>) {
  describe('AuthGateway contract', () => {
    it('reports no session when nobody is signed in', async () => {
      const { gateway } = await setup();
      const recorder = recordSessions(gateway);
      await recorder.waitFor((latest) => latest === null);
      recorder.unsubscribe();
    });

    it('signs in a provisioned owner and emits their session', async () => {
      const { gateway, createUser } = await setup();
      await createUser('owner@ecostay.test', 'owner-pass-1', 'owner');
      const recorder = recordSessions(gateway);

      await gateway.signIn('owner@ecostay.test', 'owner-pass-1');

      await recorder.waitFor(
        (latest) => latest?.email === 'owner@ecostay.test' && latest.role === 'owner',
      );
      expect(recorder.latest()?.uid).toBeTruthy();
      recorder.unsubscribe();
    });

    it('surfaces the admin role from the claims', async () => {
      const { gateway, createUser } = await setup();
      await createUser('admin@ecostay.test', 'admin-pass-1', 'admin');
      const recorder = recordSessions(gateway);

      await gateway.signIn('admin@ecostay.test', 'admin-pass-1');

      await recorder.waitFor((latest) => latest?.role === 'admin');
      recorder.unsubscribe();
    });

    it('rejects a wrong password with invalid-credentials and leaves no session', async () => {
      const { gateway, createUser } = await setup();
      await createUser('owner@ecostay.test', 'owner-pass-1', 'owner');
      const recorder = recordSessions(gateway);

      await expect(gateway.signIn('owner@ecostay.test', 'WRONG')).rejects.toMatchObject({
        code: 'invalid-credentials',
      });

      await recorder.waitFor((latest) => latest === null);
      recorder.unsubscribe();
    });

    it('rejects an unknown email with invalid-credentials', async () => {
      const { gateway } = await setup();
      await expect(gateway.signIn('nobody@ecostay.test', 'whatever')).rejects.toMatchObject({
        code: 'invalid-credentials',
      });
    });

    it('rejects an account with no role claim as not-provisioned and leaves no session', async () => {
      const { gateway, createUser } = await setup();
      await createUser('unclaimed@ecostay.test', 'unclaimed-pass-1');
      const recorder = recordSessions(gateway);

      await expect(
        gateway.signIn('unclaimed@ecostay.test', 'unclaimed-pass-1'),
      ).rejects.toMatchObject({ code: 'not-provisioned' });

      await recorder.waitFor((latest) => latest === null);
      recorder.unsubscribe();
    });

    it('rejects a device-role account as not-provisioned (dashboard is owner/admin only)', async () => {
      const { gateway, createUser } = await setup();
      await createUser('node@ecostay.test', 'device-pass-1', 'device');
      const recorder = recordSessions(gateway);

      await expect(gateway.signIn('node@ecostay.test', 'device-pass-1')).rejects.toMatchObject({
        code: 'not-provisioned',
      });

      await recorder.waitFor((latest) => latest === null);
      recorder.unsubscribe();
    });

    it('emits null to observers after sign-out', async () => {
      const { gateway, createUser } = await setup();
      await createUser('owner@ecostay.test', 'owner-pass-1', 'owner');
      const recorder = recordSessions(gateway);
      await gateway.signIn('owner@ecostay.test', 'owner-pass-1');
      await recorder.waitFor((latest) => latest?.role === 'owner');

      await gateway.signOut();

      await recorder.waitFor((latest) => latest === null);
      recorder.unsubscribe();
    });

    it('stops notifying after unsubscribe', async () => {
      const { gateway, createUser } = await setup();
      await createUser('owner@ecostay.test', 'owner-pass-1', 'owner');
      const recorder = recordSessions(gateway);
      await recorder.waitFor((latest) => latest === null);
      recorder.unsubscribe();
      const emissionsAtUnsubscribe = recorder.emissions.length;

      await gateway.signIn('owner@ecostay.test', 'owner-pass-1');
      // Give any (buggy) notification a chance to arrive before asserting silence.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(recorder.emissions.length).toBe(emissionsAtUnsubscribe);
    });
  });
}
