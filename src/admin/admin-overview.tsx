'use client';

import { Building2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AdminPropertyStatus } from '@/server/admin-directory';
import { Badge } from '@/ui/badge';
import { usePageTitle } from '@/ui/use-page-title';
import { useAdminOperations } from './admin-operations-context';

type OverviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; fleet: AdminPropertyStatus[] };

const ALERT_LABELS: Record<string, string> = {
  'device-offline': 'Device offline',
  gas: 'Gas',
  temperature: 'Temperature',
  'water-level': 'Water level',
  'ac-left-on': 'AC left on',
};

function reportingBadge(property: AdminPropertyStatus): {
  tone: 'success' | 'warn' | 'danger' | 'neutral';
  text: string;
} {
  if (property.roomCount === 0) return { tone: 'neutral', text: 'No rooms' };
  if (property.roomsReporting === property.roomCount)
    return { tone: 'success', text: 'All reporting' };
  if (property.roomsReporting === 0) return { tone: 'danger', text: 'None reporting' };
  return {
    tone: 'warn',
    text: `${property.roomsReporting}/${property.roomCount} reporting`,
  };
}

/**
 * Console landing (admin-console-v2 slice 09): the operator half of the Admin
 * role — "is everything OK across the fleet?" Reporting uses the same 15 s
 * freshness the owner dashboard shows; alerts come from the open-alert index.
 */
export function AdminOverview() {
  const operations = useAdminOperations();
  const router = useRouter();
  usePageTitle('Overview');
  const [state, setState] = useState<OverviewState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    operations.fleetStatus().then(
      (fleet) => {
        if (!cancelled) setState({ status: 'ready', fleet });
      },
      () => {
        if (!cancelled) setState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operations, attempt]);

  const fleet = state.status === 'ready' ? state.fleet : [];
  const totalRooms = fleet.reduce((n, p) => n + p.roomCount, 0);
  const totalReporting = fleet.reduce((n, p) => n + p.roomsReporting, 0);
  const totalAlerts = fleet.reduce((n, p) => n + p.openAlerts.length, 0);

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Admin / Overview
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Overview</h1>
          <p className="mt-1 text-sm text-ink-2">
            Fleet health right now — which devices are reporting and which alerts are open,
            across every property.
          </p>
        </div>

        {state.status === 'loading' ? (
          <p className="mt-6 text-sm text-ink-2">Loading…</p>
        ) : state.status === 'error' ? (
          <div className="glass mt-6 rounded-2xl p-5 text-sm text-ink-2 sm:p-6">
            <p role="alert">
              Couldn&apos;t load fleet status — check your connection and try again.
            </p>
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
        ) : (
          <>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="glass rounded-2xl p-5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                  Properties
                </dt>
                <dd className="mt-1 text-2xl font-bold text-ink">{fleet.length}</dd>
              </div>
              <div className="glass rounded-2xl p-5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                  Rooms reporting
                </dt>
                <dd className="mt-1 text-2xl font-bold text-ink">
                  {totalReporting}/{totalRooms}
                </dd>
              </div>
              <div className="glass rounded-2xl p-5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                  Open alerts
                </dt>
                <dd
                  className={`mt-1 text-2xl font-bold ${totalAlerts > 0 ? 'text-alarm' : 'text-ink'}`}
                >
                  {totalAlerts}
                </dd>
              </div>
            </dl>

            <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
                  <Building2 size={18} strokeWidth={2.2} />
                </span>
                <h2 className="text-sm font-bold text-ink">Property status</h2>
              </div>

              {fleet.length === 0 ? (
                <p className="text-sm text-ink-2">
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
                <ul className="flex flex-col divide-y divide-hairline">
                  {fleet.map((property) => {
                    const badge = reportingBadge(property);
                    return (
                      <li key={property.propertyId}>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/admin/properties/${property.propertyId}`)
                          }
                          className="flex w-full flex-col gap-2 py-4 text-left transition-colors hover:bg-brand-soft/40"
                        >
                          <span className="flex w-full items-center justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-ink">
                                {property.name ?? property.propertyId}
                              </span>
                              {property.name && (
                                <span className="block text-xs text-ink-3">
                                  {property.propertyId}
                                </span>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <Badge tone={badge.tone}>{badge.text}</Badge>
                              <ChevronRight
                                size={16}
                                strokeWidth={2.2}
                                className="shrink-0 text-ink-3"
                                aria-hidden
                              />
                            </span>
                          </span>
                          {property.openAlerts.length > 0 && (
                            <span className="flex flex-wrap gap-1.5">
                              {property.openAlerts.map((alert) => (
                                <Badge
                                  key={`${alert.roomId}-${alert.type}`}
                                  tone={alert.type === 'gas' ? 'danger' : 'warn'}
                                >
                                  {alert.roomId} · {ALERT_LABELS[alert.type] ?? alert.type}
                                </Badge>
                              ))}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
