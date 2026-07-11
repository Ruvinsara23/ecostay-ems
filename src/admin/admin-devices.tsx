'use client';

import { Cpu } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AdminRoomSummary } from '@/server/admin-directory';
import { Badge } from '@/ui/badge';
import { ListRow } from '@/ui/list-row';
import { usePageTitle } from '@/ui/use-page-title';
import { useAdminOperations } from './admin-operations-context';

type DeviceRow = {
  propertyId: string;
  propertyName: string | null;
  room: AdminRoomSummary;
};

type DevicesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: DeviceRow[] };

/**
 * Fleet device registry (v2 slice 10): READ-ONLY roll-up of every room's device
 * account + last report, composed from the existing listProperties/listRooms
 * port calls. Credentials are created/reset only in the property detail —
 * clicking a row goes there (one write path).
 */
export function AdminDevices() {
  const operations = useAdminOperations();
  const router = useRouter();
  usePageTitle('Devices');
  const [state, setState] = useState<DevicesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const properties = await operations.listProperties();
        const groups = await Promise.all(
          properties.map(async (property) => ({
            property,
            rooms: await operations.listRooms(property.propertyId),
          })),
        );
        const rows = groups.flatMap(({ property, rooms }) =>
          rooms.map((room) => ({
            propertyId: property.propertyId,
            propertyName: property.name,
            room,
          })),
        );
        if (!cancelled) setState({ status: 'ready', rows });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operations, attempt]);

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Admin / Devices
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Devices</h1>
          <p className="mt-1 text-sm text-ink-2">
            Every room&apos;s ESP32 at a glance — account status and last report. Open a room&apos;s
            property to create or reset its credentials.
          </p>
        </div>

        <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Cpu size={18} strokeWidth={2.2} />
            </span>
            <h2 className="text-sm font-bold text-ink">Device accounts</h2>
          </div>

          {state.status === 'loading' ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : state.status === 'error' ? (
            <div className="text-sm text-ink-2">
              <p role="alert">Couldn&apos;t load devices — check your connection and try again.</p>
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
          ) : state.rows.length === 0 ? (
            <p className="text-sm text-ink-2">
              No rooms registered yet —{' '}
              <Link
                href="/admin/properties"
                className="font-semibold text-brand-deep hover:underline"
              >
                register a property
              </Link>{' '}
              to get started.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {state.rows.map(({ propertyId, propertyName, room }) => (
                <ListRow
                  key={`${propertyId}/${room.roomId}`}
                  title={room.roomName ?? room.roomId}
                  subtitle={`${propertyName ?? propertyId} · ${room.roomId}`}
                  right={
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs text-ink-3">
                        {room.lastSeenAt
                          ? `Last seen ${new Date(room.lastSeenAt).toLocaleString()}`
                          : 'Never reported'}
                      </span>
                      <Badge tone={room.deviceAccountEmail ? 'success' : 'neutral'}>
                        {room.deviceAccountEmail ? 'Account' : 'No account'}
                      </Badge>
                    </span>
                  }
                  onClick={() => router.push(`/admin/properties/${propertyId}`)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
