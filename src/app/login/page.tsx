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
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="glass w-full max-w-sm rounded-2xl p-8">
        <p className="text-[12px] text-ink-3">/Sign in</p>
        <h1 className="text-2xl font-light tracking-tight text-ink">
          EcoStay <b className="font-bold">EMS</b>
        </h1>
        <p className="mt-1 text-sm text-ink-2">Sign in to your dashboard</p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="glass-lite rounded-xl px-3.5 py-2.5 font-normal text-ink outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="glass-lite rounded-xl px-3.5 py-2.5 font-normal text-ink outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm font-semibold text-alarm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
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
