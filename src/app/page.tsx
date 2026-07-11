'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { usePageTitle } from '@/ui/use-page-title';
import { RailButton } from '@/ui/rail';
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

/** ?tab= slugs so tabs and the picked room survive refresh and can be deep-linked. */
const TAB_SLUGS: Record<RoomTabView, string> = {
  'Live View': 'live',
  Devices: 'devices',
  Routines: 'routines',
  Activity: 'activity',
};
const SLUG_TO_TAB: Record<string, RoomTabView> = Object.fromEntries(
  Object.entries(TAB_SLUGS).map(([tab, slug]) => [slug, tab as RoomTabView]),
);

function RoomArea({
  activeTab,
  initialPick,
  onPickChange,
}: {
  activeTab: RoomTabView;
  initialPick: { propertyId: string; roomId: string } | null;
  onPickChange: (pick: RoomRef | null) => void;
}) {
  const { sessionState } = useAuth();
  const source = useRoomDataSource();
  const [roomsState, setRoomsState] = useState<RoomsState>({ status: 'loading' });
  const [picked, setPickedState] = useState<RoomRef | null>(null);
  const [attempt, setAttempt] = useState(0);

  const setPicked = (pick: RoomRef | null) => {
    setPickedState(pick);
    onPickChange(pick);
  };

  const session = sessionState.status === 'signed-in' ? sessionState.session : null;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    source.listAccessibleRooms(session).then(
      (rooms) => {
        if (cancelled) return;
        setRoomsState({ status: 'ready', rooms });
        // Deep link: /?pid=…&rid=… (e.g. the admin console's "View live" links).
        if (initialPick) {
          const match = rooms.find(
            (room) =>
              room.propertyId === initialPick.propertyId && room.roomId === initialPick.roomId,
          );
          if (match) setPickedState(match);
        }
      },
      () => {
        if (!cancelled) setRoomsState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
    // initialPick is deliberately frozen to the mount-time deep link — later URL
    // mirroring must not re-trigger the fetch or re-pick the room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Grouped by property so an admin's (or multi-property owner's) list scales.
    const byProperty = new Map<string, RoomRef[]>();
    for (const room of rooms) {
      const list = byProperty.get(room.propertyId) ?? [];
      list.push(room);
      byProperty.set(room.propertyId, list);
    }
    return (
      <div className="mx-auto w-full max-w-md px-6 py-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Your rooms</p>
        <h2 className="mt-1 mb-4 text-lg font-bold tracking-tight text-ink">Choose a room</h2>
        <nav aria-label="Rooms" className="flex flex-col gap-4">
          {[...byProperty.entries()].map(([propertyId, list]) => (
            <div key={propertyId}>
              <p className="mb-2 truncate text-xs font-semibold text-ink-2">
                {list[0].propertyName ?? propertyId}
              </p>
              <div className="flex flex-col gap-2.5">
                {list.map((room) => (
                  <button
                    key={`${room.propertyId}/${room.roomId}`}
                    type="button"
                    onClick={() => setPicked(room)}
                    className="glass rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5"
                  >
                    <span className="block truncate">{room.roomName ?? room.roomId}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      {rooms.length > 1 && (
        <div className="z-30 flex items-center gap-2 px-6 pb-1">
          <p className="max-w-56 truncate rounded-md bg-white/80 px-2 py-1 text-xs font-medium text-ink shadow-sm">
            {active.propertyName ?? active.propertyId}
          </p>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="rounded-md bg-white/80 px-2 py-1 text-xs font-semibold text-brand shadow-sm hover:text-brand-deep"
          >
            Switch Room
          </button>
        </div>
      )}
      {/* The 3D stage keeps a full-height feel; alerts live BELOW it in normal
          flow so the Alert Center is actually reachable (audit A2). */}
      <div className="relative h-[calc(100dvh-150px)] min-h-[560px] flex-none">
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
      </div>
      <div className="px-6 pb-8 pt-2">
        <AlertCenter propertyId={active.propertyId} />
      </div>
    </div>
  );
}


function DashboardLanding() {
  const { gateway, sessionState } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabView>(
    () => SLUG_TO_TAB[searchParams.get('tab') ?? ''] ?? 'Live View',
  );
  const [homeResetKey, setHomeResetKey] = useState(0);
  const [pick, setPick] = useState<{ propertyId: string; roomId: string } | null>(() => {
    const propertyId = searchParams.get('pid');
    const roomId = searchParams.get('rid');
    return propertyId && roomId ? { propertyId, roomId } : null;
  });

  const roomTab: RoomTabView = activeTab === 'Home' ? 'Live View' : activeTab;
  usePageTitle(roomTab);

  // Mirror tab + picked room into the URL so refresh and sharing keep the place.
  useEffect(() => {
    const params = new URLSearchParams();
    if (roomTab !== 'Live View') params.set('tab', TAB_SLUGS[roomTab]);
    if (pick) {
      params.set('pid', pick.propertyId);
      params.set('rid', pick.roomId);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [roomTab, pick, router, pathname]);

  if (sessionState.status !== 'signed-in') return null;
  const { email, role } = sessionState.session;
  const goHome = () => {
    setHomeResetKey((key) => key + 1);
    setPick(null);
    setActiveTab('Home');
  };

  return (
    <div className="mx-auto flex h-dvh w-full bg-transparent overflow-hidden max-sm:flex-col">
      {/* icon rail — horizontal bar on phones instead of a viewport-eating stack */}
      <nav
        aria-label="Navigation"
        className="glass flex flex-none flex-col items-center gap-4 border-r border-hairline bg-white/80 p-3 max-sm:flex-row max-sm:justify-around max-sm:gap-1 max-sm:border-b max-sm:border-r-0 sm:w-[90px] sm:py-6"
      >
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-2xl font-extrabold text-brand max-sm:hidden">
          e<b className="text-brand">·</b>
        </span>
        <RailButton label="Home" active={activeTab === 'Home'} onClick={goHome} icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>} />
        <RailButton label="Live View" active={activeTab === 'Live View'} onClick={() => setActiveTab('Live View')} icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>} />
        <RailButton label="Devices" active={activeTab === 'Devices'} onClick={() => setActiveTab('Devices')} icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
            <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
          </svg>} />
        <RailButton label="Routines" active={activeTab === 'Routines'} onClick={() => setActiveTab('Routines')} icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>} />
        <RailButton label="Activity" active={activeTab === 'Activity'} onClick={() => setActiveTab('Activity')} icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
          </svg>} />
        {role === 'admin' && (
        <div className="mt-auto w-full max-sm:mt-0 max-sm:w-auto">
          {/* Shield: this opens the ADMIN CONSOLE (properties/owners), not settings. */}
          <RailButton label="Admin" onClick={() => router.push('/admin')} icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <path d="M9 12l2 2 4-4"></path>
            </svg>} />
        </div>
        )}
      </nav>

      {/* main column: normal-flow header + scrollable content (the header used to
          float absolutely and the room picker rendered underneath it — audit A1). */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="z-20 flex flex-none items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand">
                <path d="M2 12h4l3-8 4 16 3-8h6" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink max-sm:text-lg">
              {roomTab === 'Live View' ? 'Live 3D Room View' : roomTab}
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RoomArea
            key={homeResetKey}
            activeTab={roomTab}
            initialPick={pick}
            onPickChange={(room) =>
              setPick(room ? { propertyId: room.propertyId, roomId: room.roomId } : null)
            }
          />
        </div>
      </main>
    </div>
  );
}

function NotificationBell() {
  const {
    token,
    requestPermission,
    permission,
    error,
    isAvailable,
    foregroundMessage,
    dismissForegroundMessage,
  } = useFcm();

  // A push arriving while the app is open shows as a brief toast (audit: these
  // were silently console.log'd before).
  useEffect(() => {
    if (!foregroundMessage) return;
    const timer = setTimeout(dismissForegroundMessage, 8000);
    return () => clearTimeout(timer);
  }, [foregroundMessage, dismissForegroundMessage]);

  const toast = foregroundMessage && (
    <div
      role="status"
      className="glass fixed bottom-5 right-5 z-50 w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl bg-white/90 p-4 shadow-xl"
    >
      <p className="text-sm font-bold text-ink">{foregroundMessage.title}</p>
      {foregroundMessage.body && (
        <p className="mt-1 text-sm text-ink-2">{foregroundMessage.body}</p>
      )}
      <button
        type="button"
        onClick={dismissForegroundMessage}
        className="mt-2 text-xs font-semibold text-brand hover:text-brand-deep"
      >
        Dismiss
      </button>
    </div>
  );

  if (!isAvailable) return toast || null;

  if (permission === 'denied') {
    return (
      <>
      {toast}
      <p
        role="status"
        title="Notifications are blocked. Enable them in your browser's site settings to get alerts."
        className="rounded-full bg-well px-3 py-2 text-xs font-semibold text-ink-3"
      >
        Alerts blocked in browser
      </p>
      </>
    );
  }

  if (permission === 'granted' && token) {
    return (
      <>
      {toast}
      <div
        role="status"
        title="Notifications enabled"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success shadow-sm"
      >
        <span className="sr-only">Notifications enabled</span>
        <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      </div>
      </>
    );
  }

  return (
    <>
    {toast}
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
    {error && (
      <span role="alert" className="max-w-48 text-xs font-semibold text-alarm">
        {error}
      </span>
    )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <RequireSession>
      <Suspense fallback={null}>
        <DashboardLanding />
      </Suspense>
    </RequireSession>
  );
}
