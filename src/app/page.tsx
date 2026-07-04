'use client';

import { useAuth } from '@/auth/auth-context';
import { RequireSession } from '@/auth/require-session';

function DashboardLanding() {
  const { gateway, sessionState } = useAuth();
  if (sessionState.status !== 'signed-in') return null;
  const { email, role } = sessionState.session;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            EcoStay EMS
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {email} ({role})
          </p>
        </div>
        <button
          type="button"
          onClick={() => gateway.signOut()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </header>
      <section className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Live room telemetry arrives in the next slice (issue 02).
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireSession>
      <DashboardLanding />
    </RequireSession>
  );
}
