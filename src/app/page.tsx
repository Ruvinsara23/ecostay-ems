'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { RequireSession } from '@/auth/require-session';
import { AlertCenter } from '@/rooms/alert-center';
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
    return <p className="text-sm text-ink-2">Loading your rooms…</p>;
  }

  const { rooms } = roomsState;

  if (rooms.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-ink-2">
        No property assigned to this account — contact your administrator.
      </div>
    );
  }

  const active = rooms.length === 1 ? rooms[0] : picked;

  if (!active) {
    return (
      <nav aria-label="Rooms" className="flex flex-col gap-2.5">
        {rooms.map((room) => (
          <button
            key={`${room.propertyId}/${room.roomId}`}
            type="button"
            onClick={() => setPicked(room)}
            className="glass rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            {room.roomName ?? room.roomId}
            <span className="block text-xs font-normal text-ink-3">
              {room.propertyName ?? room.propertyId}
            </span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-3">
          <span aria-hidden>/</span>
          <span>{active.propertyName ?? active.propertyId}</span>
        </p>
        {rooms.length > 1 && (
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="text-sm font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
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
      <AlertCenter propertyId={active.propertyId} />
    </div>
  );
}

function RailIcon({ children, label, active }: { children: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        aria-hidden
        className={`grid h-11 w-11 place-items-center rounded-full ${
          active ? 'bg-ink text-white' : 'text-ink-3'
        }`}
      >
        {children}
      </span>
      <span className="text-[10px] text-ink-3 max-sm:hidden">{label}</span>
    </div>
  );
}

function DashboardLanding() {
  const { gateway, sessionState } = useAuth();
  if (sessionState.status !== 'signed-in') return null;
  const { email, role } = sessionState.session;

  return (
    <div className="mx-auto flex min-h-screen w-full gap-3.5 p-3.5 max-sm:flex-col">
      {/* icon rail */}
      <nav
        aria-label="Navigation"
        className="glass flex flex-none items-center gap-3 rounded-2xl p-3 sm:sticky sm:top-3.5 sm:h-[calc(100vh-28px)] sm:w-[70px] sm:flex-col sm:py-4"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-lg font-extrabold text-white">
          e<b className="text-brand">·</b>
        </span>
        <RailIcon label="Live" active>
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 12h4l3-8 4 16 3-8h6" />
          </svg>
        </RailIcon>
        <span title="Rooms — coming soon" aria-disabled="true" className="cursor-not-allowed opacity-60">
          <RailIcon label="Rooms">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
              <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
            </svg>
          </RailIcon>
        </span>
        <span title="Alerts — coming soon" aria-disabled="true" className="cursor-not-allowed opacity-60">
          <RailIcon label="Alerts">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
          </RailIcon>
        </span>
      </nav>

      {/* main column */}
      <main className="flex min-w-0 flex-1 flex-col gap-3.5">
        <header className="flex flex-wrap items-center gap-3 px-1">
          <div>
            <p className="text-[12px] text-ink-3">/Live view</p>
            <h1 className="text-2xl font-light tracking-tight text-ink">
              EcoStay <b className="font-bold">EMS</b>
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <p className="text-xs text-ink-2">
              Signed in as {email} ({role})
            </p>
            <button
              type="button"
              onClick={() => gateway.signOut()}
              className="glass-lite rounded-full px-4 py-2 text-sm font-semibold text-ink-2 hover:text-ink"
            >
              Sign out
            </button>
            <span
              title={`${email} (${role})`}
              className="glass-lite grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-ink"
            >
              {(email ?? '?').charAt(0).toUpperCase()}
            </span>
          </div>
        </header>
        <RoomArea />
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireSession>
      <DashboardLanding />
    </RequireSession>
  );
}
