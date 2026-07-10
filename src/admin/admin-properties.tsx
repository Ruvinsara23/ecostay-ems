'use client';

import { Building2, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AdminPropertySummary } from '@/server/admin-directory';
import { useAdminOperations } from './admin-operations-context';

type PropertiesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; properties: AdminPropertySummary[] };

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Browse-first entry of the admin console: every property, with counts, one click to detail. */
export function AdminProperties() {
  const operations = useAdminOperations();
  const router = useRouter();
  const [state, setState] = useState<PropertiesState>({ status: 'loading' });
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
            Admin / Properties
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Properties</h1>
          <p className="mt-1 text-sm text-ink-2">
            Every registered property — open one to see its rooms, devices, and owners.
          </p>
        </div>

        <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Building2 size={18} strokeWidth={2.2} />
            </span>
            <h2 className="text-sm font-bold text-ink">All properties</h2>
          </div>

          {state.status === 'loading' ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : state.status === 'error' ? (
            <div role="alert" className="text-sm text-ink-2">
              Couldn&apos;t load properties — check your connection and try again.
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
            <p className="text-sm text-ink-2">
              No properties yet — register a room (Rooms view) to create the first one.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {state.properties.map((property) => (
                <li key={property.propertyId}>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/properties/${property.propertyId}`)}
                    className="flex w-full items-center justify-between gap-3 py-4 text-left transition-colors hover:text-brand-deep"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">
                        {property.name ?? property.propertyId}
                      </span>
                      {property.name && (
                        <span className="block text-xs text-ink-3">{property.propertyId}</span>
                      )}
                    </span>
                    <span className="flex flex-none items-center gap-3">
                      <span className="text-xs font-medium text-ink-2">
                        {count(property.roomCount, 'room')} · {count(property.ownerCount, 'owner')}
                      </span>
                      <ChevronRight size={16} strokeWidth={2.2} aria-hidden className="text-ink-3" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
