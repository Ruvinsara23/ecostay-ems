'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AdminPropertySummary } from '@/server/admin-directory';
import { AlertCenter } from '@/rooms/alert-center';
import { usePageTitle } from '@/ui/use-page-title';
import { useAdminOperations } from './admin-operations-context';

type AlertsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; properties: AdminPropertySummary[] };

/**
 * Fleet alerts (v2 slice 10): one AlertCenter per property, so the operator
 * acknowledges from a single page instead of opening each property detail.
 * Same subscribe + acknowledge path the detail page uses — no new writes.
 */
export function AdminAlerts() {
  const operations = useAdminOperations();
  usePageTitle('Alerts');
  const [state, setState] = useState<AlertsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    operations.listProperties().then(
      (properties) => {
        if (!cancelled) setState({ status: 'ready', properties });
      },
      () => {
        if (!cancelled) setState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operations, attempt]);

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Admin / Alerts
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Alerts</h1>
          <p className="mt-1 text-sm text-ink-2">
            Open and recently resolved safety alerts for every property — acknowledge them
            right here.
          </p>
        </div>

        {state.status === 'loading' ? (
          <p className="mt-6 text-sm text-ink-2">Loading…</p>
        ) : state.status === 'error' ? (
          <div className="glass mt-6 rounded-2xl p-5 text-sm text-ink-2 sm:p-6">
            <p role="alert">Couldn&apos;t load properties — check your connection and try again.</p>
            <button
              type="button"
              onClick={() => {
                setState({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
              className="mt-3 block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-deep"
            >
              Retry
            </button>
          </div>
        ) : state.properties.length === 0 ? (
          <p className="mt-6 text-sm text-ink-2">
            No properties yet —{' '}
            <Link
              href="/admin/properties"
              className="font-semibold text-brand-deep hover:underline"
            >
              register the first one in Properties
            </Link>
            .
          </p>
        ) : (
          state.properties.map((property) => (
            <section key={property.propertyId} className="mt-6">
              <h2 className="text-sm font-bold text-ink">
                {property.name ?? property.propertyId}
              </h2>
              {property.name && (
                <p className="text-xs text-ink-3">{property.propertyId}</p>
              )}
              <div className="mt-2">
                <AlertCenter propertyId={property.propertyId} />
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
