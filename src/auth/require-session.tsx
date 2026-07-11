'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from './auth-context';
import { isDashboardRole } from './auth-gateway';

/**
 * Wraps dashboard routes. Only an owner/admin session may render children.
 * Signed-out visitors go to login with the requested path preserved in ?next=.
 * A signed-in NON-dashboard session (e.g. a device credential) gets an explicit
 * dead-end screen — never a redirect, which used to ping-pong with /login.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { gateway, sessionState } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const signedOut = sessionState.status === 'signed-out';
  const wrongRole =
    sessionState.status === 'signed-in' && !isDashboardRole(sessionState.session.role);

  useEffect(() => {
    if (signedOut) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [signedOut, pathname, router]);

  if (sessionState.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-2">Loading…</p>
      </main>
    );
  }
  if (wrongRole) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-2xl p-8 text-center">
          <h1 className="text-lg font-bold text-ink">This account can&apos;t use the dashboard</h1>
          <p className="mt-2 text-sm text-ink-2">
            It isn&apos;t provisioned for dashboard access (device and service accounts belong in
            hardware, not here). Sign in with an owner or admin account instead.
          </p>
          <button
            type="button"
            onClick={() => gateway.signOut()}
            className="mx-auto mt-5 block rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }
  if (signedOut) return null;
  return <>{children}</>;
}
