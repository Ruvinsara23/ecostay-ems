'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { RequireSession } from '@/auth/require-session';
import { AlertCenter } from '@/rooms/alert-center';
import type { RoomRef } from '@/rooms/room-data-source';
import { useRoomDataSource } from '@/rooms/room-data-source-context';
import { RoomLiveView } from '@/rooms/room-live-view';

type RoomsState = { status: 'loading' } | { status: 'ready'; rooms: RoomRef[] };

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-12">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand/25 border-t-brand" />
        <span className="text-xs font-medium text-ink-3">{label}</span>
      </div>
    </div>
  );
}

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
    return <Spinner label="Loading rooms" />;
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
    <div className="relative h-full w-full flex-1">
      {rooms.length > 1 && (
        <div className="absolute left-6 top-24 z-30 flex items-center gap-2">
          <p className="text-xs font-medium text-ink bg-white/80 px-2 py-1 rounded-md shadow-sm">
            {active.propertyName ?? active.propertyId}
          </p>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="text-xs font-semibold text-brand hover:text-brand-deep bg-white/80 px-2 py-1 rounded-md shadow-sm"
          >
            Switch Room
          </button>
        </div>
      )}
      <RoomLiveView
        propertyId={active.propertyId}
        roomId={active.roomId}
        roomName={active.roomName}
        propertyName={active.propertyName}
      />
      <AlertCenter propertyId={active.propertyId} />
    </div>
  );
}

function RailIcon({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex w-full flex-col items-center gap-1.5 py-2 transition-colors ${
        active ? 'text-brand' : 'text-ink-3 hover:text-ink'
      }`}
    >
      <span
        aria-hidden
        className={`grid h-10 w-10 place-items-center rounded-2xl transition-colors ${
          active ? 'bg-brand text-white shadow-md' : 'bg-transparent text-current hover:bg-brand/10'
        }`}
      >
        {children}
      </span>
      <span className="text-[11px] font-medium max-sm:hidden">{label}</span>
    </button>
  );
}

function DashboardLanding() {
  const { gateway, sessionState } = useAuth();
  const router = useRouter();

  if (sessionState.status !== 'signed-in') return null;
  const { email, role } = sessionState.session;

  return (
    <div className="mx-auto flex h-screen w-full bg-transparent overflow-hidden max-sm:flex-col">
      {/* icon rail */}
      <nav
        aria-label="Navigation"
        className="glass flex flex-none flex-col items-center gap-4 border-r border-hairline bg-white/80 p-3 sm:w-[90px] sm:py-6"
      >
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-2xl font-extrabold text-brand">
          i
        </span>
        <RailIcon label="Live View" active>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </RailIcon>
        {role === 'admin' ? (
          <div className="mt-auto w-full">
            <RailIcon label="Admin" onClick={() => router.push('/admin')}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </RailIcon>
          </div>
        ) : (
          <div className="mt-auto" />
        )}
      </nav>

      {/* main column */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Absolute floating header over the 3D scene */}
        <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand">
                <path d="M2 12h4l3-8 4 16 3-8h6" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Live 3D Room View
            </h1>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm text-ink-3 hover:text-ink">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            {role === 'admin' && (
              <button
                type="button"
                onClick={() => router.push('/admin')}
                className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-deep"
              >
                Admin Console
              </button>
            )}
            <button
              type="button"
              onClick={() => gateway.signOut()}
              aria-label="Sign out"
              title={`Sign out ${email} (${role})`}
              className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-brand-soft ring-2 ring-white"
            >
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=ecostay" alt="" className="h-full w-full object-cover" />
            </button>
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
