'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from './auth-context';
import { isDashboardRole } from './auth-gateway';

/**
 * Wraps dashboard routes. Only an owner/admin session may render children;
 * everyone else is sent to login with the requested path preserved in ?next=.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { sessionState } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const denied =
    sessionState.status === 'signed-out' ||
    (sessionState.status === 'signed-in' && !isDashboardRole(sessionState.session.role));

  useEffect(() => {
    if (denied) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [denied, pathname, router]);

  if (sessionState.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }
  if (denied) return null;
  return <>{children}</>;
}
