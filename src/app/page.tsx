'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { RequireSession } from '@/auth/require-session';
import type { RoomRef } from '@/rooms/room-data-source';
import { useRoomDataSource } from '@/rooms/room-data-source-context';
import { RoomLiveView } from '@/rooms/room-live-view';

type RoomsState = { status: 'loading' } | { status: 'ready'; rooms: RoomRef[] };

function RoomArea() {
  const { sessionState } = useAuth();
  const source = useRoomDataSource();
  const [roomsState, setRoomsState] = useState<RoomsState>({ status: 'loading' });
  const [picked, setPicked] = useState<RoomRef | null>(null);

  const session = sessionState.status === 'signed-in' ? sessionState.session : null;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    source.listAccessibleRooms(session).then((rooms) => {
      if (!cancelled) setRoomsState({ status: 'ready', rooms });
    });
    return () => {
      cancelled = true;
    };
  }, [source, session]);

  if (roomsState.status === 'loading') {
    return <p className="text-sm text-zinc-500">Loading your rooms…</p>;
  }

  const { rooms } = roomsState;

  if (rooms.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        No property assigned to this account — contact your administrator.
      </div>
    );
  }

  const active = rooms.length === 1 ? rooms[0] : picked;

  if (!active) {
    return (
      <nav aria-label="Rooms" className="flex flex-col gap-2">
        {rooms.map((room) => (
          <button
            key={`${room.propertyId}/${room.roomId}`}
            type="button"
            onClick={() => setPicked(room)}
            className="rounded-md border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {room.roomName ?? room.roomId}
            <span className="block text-xs font-normal text-zinc-500">
              {room.propertyName ?? room.propertyId}
            </span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{active.propertyName ?? active.propertyId}</p>
        {rooms.length > 1 && (
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            All rooms
          </button>
        )}
      </div>
      <RoomLiveView
        propertyId={active.propertyId}
        roomId={active.roomId}
        roomName={active.roomName}
      />
    </div>
  );
}

function DashboardLanding() {
  const { gateway, sessionState } = useAuth();
  if (sessionState.status !== 'signed-in') return null;
  const { email, role } = sessionState.session;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            EcoStay EMS
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {email} ({role})
          </p>
        </div>
        <button
          type="button"
          onClick={() => gateway.signOut()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </header>
      <RoomArea />
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireSession>
      <DashboardLanding />
    </RequireSession>
  );
}
