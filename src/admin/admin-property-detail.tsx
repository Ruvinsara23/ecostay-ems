'use client';

import { ArrowLeft, Cpu, DoorOpen } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AdminRoomSummary } from '@/server/admin-directory';
import { useAdminOperations } from './admin-operations-context';

type RoomsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rooms: AdminRoomSummary[] };

function DeviceStatus({ room }: { room: AdminRoomSummary }) {
  return (
    <span className="flex min-w-0 flex-col items-end gap-1 text-right">
      {room.deviceAccountEmail ? (
        <span className="flex items-center gap-1.5 text-xs font-medium text-brand-deep">
          <Cpu size={13} strokeWidth={2.2} aria-hidden />
          <span className="min-w-0 break-all font-mono">{room.deviceAccountEmail}</span>
        </span>
      ) : (
        <span className="text-xs font-medium text-ink-3">No device account</span>
      )}
      <span className="text-xs text-ink-3">
        {room.lastSeenAt
          ? `Last seen ${new Date(room.lastSeenAt).toLocaleString()}`
          : 'Never reported'}
      </span>
    </span>
  );
}

/** One property's rooms with device-account + last-seen status (admin-console-v2 slice 04/05). */
export function AdminPropertyDetail({ propertyId }: { propertyId: string }) {
  const operations = useAdminOperations();
  const [state, setState] = useState<RoomsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    operations.listRooms(propertyId).then(
      (rooms) => {
        if (!cancelled) setState({ status: 'ready', rooms });
      },
      () => {
        if (!cancelled) setState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operations, propertyId, attempt]);

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
          Back to Properties
        </Link>

        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Admin / Properties / {propertyId}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{propertyId}</h1>
          <p className="mt-1 text-sm text-ink-2">
            Rooms in this property, each with its device account and last report.
          </p>
        </div>

        <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
              <DoorOpen size={18} strokeWidth={2.2} />
            </span>
            <h2 className="text-sm font-bold text-ink">Rooms</h2>
          </div>

          {state.status === 'loading' ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : state.status === 'error' ? (
            <div role="alert" className="text-sm text-ink-2">
              Couldn&apos;t load rooms — check your connection and try again.
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
          ) : state.rooms.length === 0 ? (
            <p className="text-sm text-ink-2">
              No rooms registered for this property yet — use the Rooms view to register one.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {state.rooms.map((room) => (
                <li
                  key={room.roomId}
                  className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">
                      {room.roomName ?? room.roomId}
                    </span>
                    {room.roomName && (
                      <span className="block text-xs text-ink-3">{room.roomId}</span>
                    )}
                  </span>
                  <DeviceStatus room={room} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
