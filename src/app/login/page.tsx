'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { AuthGatewayError, isDashboardRole } from '@/auth/auth-gateway';

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

function BrandMark() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-lg font-extrabold text-white">
      e<b className="text-brand">·</b>
    </span>
  );
}

/** The right-hand brand panel — a self-contained emerald hero echoing the live product. */
function AuthShowcase() {
  return (
    <div
      className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
      style={{
        background:
          'linear-gradient(150deg, #a78bfa 0%, #8b5cf6 52%, #6d28d9 100%)',
      }}
    >
      {/* soft light bloom */}
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.4), transparent 65%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.15), transparent 65%)' }}
      />

      <div className="relative flex items-center gap-2 text-white">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/20 text-base font-extrabold backdrop-blur">
          e·
        </span>
        <span className="text-sm font-semibold tracking-wide">EcoStay EMS</span>
      </div>

      {/* floating product mock */}
      <div className="relative my-8 grid place-items-center">
        <div className="w-full max-w-sm rounded-[1.25rem] border border-white/40 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/70">
                Live view
              </p>
              <p className="text-sm font-bold text-white">Room 1</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          </div>
          
          {/* Isometric preview */}
          <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-inner bg-white/5 border border-white/20">
            <img src="/3d-model.png" alt="3D Room Preview" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/80 via-transparent to-transparent opacity-60"></div>
          </div>
          
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Occupancy', 'Occupied'],
              ['Temp', '22.5 °C'],
              ['Power', '4.8 W'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/10 py-1.5 border border-white/10">
                <p className="text-[9px] text-white/70 uppercase tracking-wider">{k}</p>
                <p className="text-[11px] font-bold text-white [font-variant-numeric:tabular-nums]">
                  {v}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* floating sensor chips */}
        <span className="absolute -left-4 top-8 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[11px] font-bold text-white shadow-xl backdrop-blur-md">
          Gas 150 ppm
        </span>
        <span className="absolute -right-4 bottom-12 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[11px] font-bold text-white shadow-xl backdrop-blur-md">
          Tank 76%
        </span>
      </div>

      <div className="relative text-white">
        <h2 className="text-2xl font-bold leading-tight tracking-tight text-balance">
          Every room, live in one view.
        </h2>
        <p className="mt-2 max-w-sm text-sm text-white/80">
          Monitor occupancy, energy, and safety across your property — and control it from
          anywhere, in real time.
        </p>
      </div>
    </div>
  );
}

function LoginPageInner() {
  const { gateway, sessionState } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const session = sessionState.status === 'signed-in' ? sessionState.session : null;
  // Role-aware landing (UI-architecture S1, approved): an explicit ?next= wins;
  // otherwise admins land on the console, owners on the dashboard.
  const destination = session
    ? nextParam
      ? safeNextPath(nextParam)
      : session.role === 'admin'
        ? '/admin'
        : '/'
    : null;
  const redirecting = session !== null && isDashboardRole(session.role);

  useEffect(() => {
    if (redirecting && destination) {
      router.replace(destination);
    }
  }, [redirecting, destination, router]);

  if (redirecting) {
    // Never flash the login form at an already-signed-in user.
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-2">Signing you in…</p>
      </main>
    );
  }

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
    <main className="grid min-h-screen w-full lg:grid-cols-2">
      {/* left: the form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <BrandMark />
            <span className="text-sm font-semibold tracking-wide text-ink-2">EcoStay EMS</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-ink text-balance">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-ink-2">
            Sign in to monitor and control your property.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="glass-lite rounded-xl px-3.5 py-2.5 font-normal text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-brand"
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
                placeholder="••••••••"
                className="glass-lite rounded-xl px-3.5 py-2.5 font-normal text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-brand"
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
              className="mt-1 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-xs text-ink-3">
            Accounts are created by your administrator. © EcoStay EMS.
          </p>
        </div>
      </div>

      {/* right: brand showcase (hidden on small screens) */}
      <AuthShowcase />
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
