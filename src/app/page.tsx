'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { RequireSession } from '@/auth/require-session';
import { AlertCenter } from '@/rooms/alert-center';
import type { RoomRef } from '@/rooms/room-data-source';
import { useRoomDataSource } from '@/rooms/room-data-source-context';
import { RoomLiveView } from '@/rooms/room-live-view';
import { RoomDevicesView } from '@/rooms/room-devices-view';
import { RoomRoutinesView } from '@/rooms/room-routines-view';
import { RoomActivityView } from '@/rooms/room-activity-view';
import { useFcm } from '@/hooks/use-fcm';

type RoomsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rooms: RoomRef[] };

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

type RoomTabView = 'Live View' | 'Devices' | 'Routines' | 'Activity';
type TabView = 'Home' | RoomTabView;

function RoomArea({ activeTab }: { activeTab: RoomTabView }) {
  const { sessionState } = useAuth();
  const source = useRoomDataSource();
  const [roomsState, setRoomsState] = useState<RoomsState>({ status: 'loading' });
  const [picked, setPicked] = useState<RoomRef | null>(null);
  const [attempt, setAttempt] = useState(0);

  const session = sessionState.status === 'signed-in' ? sessionState.session : null;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    source.listAccessibleRooms(session).then(
      (rooms) => {
        if (!cancelled) setRoomsState({ status: 'ready', rooms });
      },
      () => {
        if (!cancelled) setRoomsState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, session, attempt]);

  if (roomsState.status === 'loading') {
    return <Spinner label="Loading rooms" />;
  }

  if (roomsState.status === 'error') {
    return (
      <div role="alert" className="glass rounded-2xl p-8 text-center text-sm text-ink-2">
        Couldn&apos;t load your rooms — check your connection and try again.
        <button
          type="button"
          onClick={() => {
            setRoomsState({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
          className="mx-auto mt-4 block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-deep"
        >
          Retry
        </button>
      </div>
    );
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
      {activeTab === 'Live View' && (
        <RoomLiveView
          propertyId={active.propertyId}
          roomId={active.roomId}
          roomName={active.roomName}
          propertyName={active.propertyName}
        />
      )}
      {activeTab === 'Devices' && (
        <RoomDevicesView
          propertyId={active.propertyId}
          roomId={active.roomId}
          roomName={active.roomName}
        />
      )}
      {activeTab === 'Routines' && (
        <RoomRoutinesView
          propertyId={active.propertyId}
          roomId={active.roomId}
          roomName={active.roomName}
        />
      )}
      {activeTab === 'Activity' && (
        <RoomActivityView
          propertyId={active.propertyId}
          roomId={active.roomId}
          roomName={active.roomName}
        />
      )}
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
  const [activeTab, setActiveTab] = useState<TabView>('Live View');
  const [homeResetKey, setHomeResetKey] = useState(0);

  if (sessionState.status !== 'signed-in') return null;
  const { email, role } = sessionState.session;
  const roomTab: RoomTabView = activeTab === 'Home' ? 'Live View' : activeTab;
  const goHome = () => {
    setHomeResetKey((key) => key + 1);
    setActiveTab('Home');
  };

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
        <RailIcon label="Home" active={activeTab === 'Home'} onClick={goHome}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </RailIcon>
        <RailIcon label="Live View" active={activeTab === 'Live View'} onClick={() => setActiveTab('Live View')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </RailIcon>
        <RailIcon label="Devices" active={activeTab === 'Devices'} onClick={() => setActiveTab('Devices')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
            <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
          </svg>
        </RailIcon>
        <RailIcon label="Routines" active={activeTab === 'Routines'} onClick={() => setActiveTab('Routines')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </RailIcon>
        <RailIcon label="Activity" active={activeTab === 'Activity'} onClick={() => setActiveTab('Activity')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
          </svg>
        </RailIcon>
        {role === 'admin' && (
        <div className="mt-auto w-full">
          <RailIcon label="Settings" onClick={() => router.push('/admin')}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </RailIcon>
        </div>
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
          </div>
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <NotificationBell />

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
        <RoomArea key={homeResetKey} activeTab={roomTab} />
      </main>
    </div>
  );
}

function NotificationBell() {
  const { token, requestPermission, permission, error, isAvailable } = useFcm();

  if (!isAvailable) return null;

  if (permission === 'granted' && token) {
    return (
      <div
        role="status"
        title="Notifications enabled"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-600 shadow-sm"
      >
        <span className="sr-only">Notifications enabled</span>
        <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      </div>
    );
  }

  return (
    <button
      onClick={requestPermission}
      title={error || "Enable Push Notifications"}
      className="flex items-center gap-2 rounded-full bg-brand-soft px-4 py-2 text-sm font-medium text-brand hover:bg-brand/20 shadow-sm"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      Enable Alerts
    </button>
  );
}

export default function DashboardPage() {
  return (
    <RequireSession>
      <DashboardLanding />
    </RequireSession>
  );
}
