'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { AuthGatewayError } from '@/auth/auth-gateway';

/** Only ever redirect within the app — a `next` like `https://evil.example` or `//host` is discarded. */
function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

function errorMessage(error: unknown): string {
  if (error instanceof AuthGatewayError) {
    if (error.code === 'invalid-credentials') return 'Incorrect email or password.';
    if (error.code === 'not-provisioned') {
      return 'This account is not provisioned for dashboard access. Contact your administrator.';
    }
  }
  return 'Sign-in is currently unavailable. Please try again.';
}

function LoginPageInner() {
  const { gateway, sessionState } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sessionState.status === 'signed-in') {
      router.replace(nextPath);
    }
  }, [sessionState.status, nextPath, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await gateway.signIn(email, password);
      // Success: the session state change above triggers the redirect.
    } catch (signInError) {
      setError(errorMessage(signInError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          EcoStay EMS
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Sign in to your dashboard
        </p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary for Next's static build.
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
