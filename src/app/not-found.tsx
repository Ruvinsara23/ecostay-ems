import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="glass w-full max-w-md rounded-2xl p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">404</p>
        <h1 className="mt-1 text-lg font-bold tracking-tight text-ink">
          This page doesn&apos;t exist
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          The link may be old, or the address was mistyped.
        </p>
        <Link
          href="/"
          className="mx-auto mt-5 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep"
        >
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
