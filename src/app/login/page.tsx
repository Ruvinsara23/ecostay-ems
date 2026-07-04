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
          'linear-gradient(150deg, #12a15e 0%, #0e8a4f 52%, #0b6f40 100%)',
      }}
    >
      {/* soft light bloom */}
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 65%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.18), transparent 65%)' }}
      />

      <div className="relative flex items-center gap-2 text-white">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-base font-extrabold backdrop-blur">
          e·
        </span>
        <span className="text-sm font-semibold tracking-wide">EcoStay EMS</span>
      </div>

      {/* floating product mock */}
      <div className="relative my-8 grid place-items-center">
        <div className="w-full max-w-sm rounded-2xl border border-white/40 bg-white/85 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-3">
                Live view
              </p>
              <p className="text-sm font-bold text-ink">Room 1</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-deep" />
              Live
            </span>
          </div>
          <svg viewBox="0 0 300 90" className="mt-3 w-full" aria-hidden>
            <defs>
              <linearGradient id="loginArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#12a15e" stopOpacity="0.25" />
                <stop offset="1" stopColor="#12a15e" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polygon
              points="0,70 26,58 52,63 78,44 104,50 130,32 156,40 182,26 208,34 234,20 260,30 300,22 300,90 0,90"
              fill="url(#loginArea)"
            />
            <polyline
              points="0,70 26,58 52,63 78,44 104,50 130,32 156,40 182,26 208,34 234,20 260,30 300,22"
              fill="none"
              stroke="#12a15e"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx="300" cy="22" r="3.5" fill="#0e8a4f" />
          </svg>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ['Occupancy', 'Occupied'],
              ['Temp', '27.5 °C'],
              ['Power', '4.8 W'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-ink/[0.04] py-1.5">
                <p className="text-[9px] text-ink-3">{k}</p>
                <p className="text-[11px] font-bold text-ink [font-variant-numeric:tabular-nums]">
                  {v}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* floating sensor chips */}
        <span className="absolute -left-2 top-2 rounded-full border border-white/40 bg-white/90 px-3 py-1 text-[11px] font-semibold text-ink shadow-lg backdrop-blur">
          Gas 150 ppm
        </span>
        <span className="absolute -right-2 bottom-4 rounded-full border border-white/40 bg-white/90 px-3 py-1 text-[11px] font-semibold text-ink shadow-lg backdrop-blur">
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
