'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from './auth-context';

/**
 * Admin-only wrapper. A signed-out visitor goes to login (path preserved); an
 * owner (or any non-admin) is redirected to the dashboard — admins only render.
 * Belt to the RTDB rules' braces: the server rules are the real boundary.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { sessionState } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const signedOut = sessionState.status === 'signed-out';
  const notAdmin =
    sessionState.status === 'signed-in' && sessionState.session.role !== 'admin';

  useEffect(() => {
    if (signedOut) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (notAdmin) {
      router.replace('/');
    }
  }, [signedOut, notAdmin, pathname, router]);

  if (sessionState.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-2">Loading…</p>
      </main>
    );
  }
  if (signedOut || notAdmin) return null;
  return <>{children}</>;
}
