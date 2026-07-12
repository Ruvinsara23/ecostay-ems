'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePageTitle } from '@/ui/use-page-title';
import { RailButton } from '@/ui/rail';
import { useAuth } from '@/auth/auth-context';
import { RequireSession } from '@/auth/require-session';
import { AlertCenter } from '@/rooms/alert-center';
import type { RoomRef } from '@/rooms/room-data-source';
import { useRoomDataSource } from '@/rooms/room-data-source-context';
import { OwnerHome } from '@/rooms/owner-home';
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
  pick,
  onOpenRoom,
  onBackHome,
  onOverviewChange,
}: {
  activeTab: TabView;
  pick: { propertyId: string; roomId: string } | null;
  onOpenRoom: (room: RoomRef) => void;
  onBackHome: () => void;
  onOverviewChange: (showing: boolean) => void;
}) {
  const { sessionState } = useAuth();
  const source = useRoomDataSource();
  const [roomsState, setRoomsState] = useState<RoomsState>({ status: 'loading' });
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

  const rooms = roomsState.status === 'ready' ? roomsState.rooms : [];
  // One room → straight in. Otherwise the active room is whichever the URL/Home
  // selection points at (null = show the overview).
  const activeRoom =
    rooms.length === 1
      ? rooms[0]
      : pick
        ? (rooms.find((r) => r.propertyId === pick.propertyId && r.roomId === pick.roomId) ?? null)
        : null;
  const showOverview =
    roomsState.status === 'ready' &&
    rooms.length > 0 &&
    (!activeRoom || (activeTab === 'Home' && rooms.length > 1));

  // Tell the shell whether the overview (vs a room) is on screen, so the header
  // title matches. Depends only on the boolean — the callback is stable enough.
  useEffect(() => {
    onOverviewChange(showOverview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverview]);

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

  if (rooms.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-ink-2">
        No property assigned to this account — contact your administrator.
      </div>
    );
  }

  if (showOverview || !activeRoom) {
    return <OwnerHome rooms={rooms} onOpenRoom={onOpenRoom} />;
  }

  const active = activeRoom;
  const view: RoomTabView = activeTab === 'Home' ? 'Live View' : activeTab;

  return (
    <div className="flex min-h-full flex-col">
      {rooms.length > 1 && (
        <div className="z-30 flex items-center gap-2 px-6 pb-1">
          <p className="max-w-56 truncate rounded-md bg-white/80 px-2 py-1 text-xs font-medium text-ink shadow-sm">
            {active.propertyName ?? active.propertyId}
          </p>
          <button
            type="button"
            onClick={onBackHome}
            className="rounded-md bg-white/80 px-2 py-1 text-xs font-semibold text-brand shadow-sm hover:text-brand-deep"
          >
            All rooms
          </button>
        </div>
      )}
      {/* The 3D stage keeps a full-height feel; alerts live BELOW it in normal
          flow so the Alert Center is actually reachable (audit A2). */}
      <div className="relative h-[calc(100dvh-150px)] min-h-[560px] flex-none">
      {view === 'Live View' && (
        <RoomLiveView
          propertyId={active.propertyId}
          roomId={active.roomId}
          roomName={active.roomName}
          propertyName={active.propertyName}
        />
      )}
      {view === 'Devices' && (
        <RoomDevicesView
          propertyId={active.propertyId}
          roomId={active.roomId}
          roomName={active.roomName}
        />
      )}
      {view === 'Routines' && (
        <RoomRoutinesView
          propertyId={active.propertyId}
          roomId={active.roomId}
          roomName={active.roomName}
        />
      )}
      {view === 'Activity' && (
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
  const [activeTab, setActiveTab] = useState<TabView>(() => {
    const slug = searchParams.get('tab');
    if (slug && SLUG_TO_TAB[slug]) return SLUG_TO_TAB[slug];
    // A room deep link opens its live view; otherwise land on the overview.
    return searchParams.get('pid') && searchParams.get('rid') ? 'Live View' : 'Home';
  });
  const [pick, setPick] = useState<{ propertyId: string; roomId: string } | null>(() => {
    const propertyId = searchParams.get('pid');
    const roomId = searchParams.get('rid');
    return propertyId && roomId ? { propertyId, roomId } : null;
  });
  // RoomArea reports whether the property overview (vs a single room) is showing,
  // so the header title stays truthful. Starts true; corrected on first render.
  const [overviewShowing, setOverviewShowing] = useState(true);

  // Admins' home is the CONSOLE (owner-reported). A signed-in admin landing on
  // "/" bare is redirected; an EXPLICIT visit (?tab=/?pid= — e.g. the console's
  // "Live rooms" link or a View-live deep link) renders normally. Decided once
  // at mount so the URL-mirror below can never re-trigger it.
  const [explicitVisit] = useState(
    () => searchParams.has('tab') || searchParams.has('pid') || searchParams.has('rid'),
  );
  const isAdmin =
    sessionState.status === 'signed-in' && sessionState.session.role === 'admin';
  const bounceToConsole = isAdmin && pathname === '/' && !explicitVisit;

  useEffect(() => {
    if (bounceToConsole) router.replace('/admin');
  }, [bounceToConsole, router]);

  // Header title: the overview reads "My Properties"; a room reads its tab.
  const roomTab: RoomTabView = activeTab === 'Home' ? 'Live View' : activeTab;
  usePageTitle(overviewShowing ? 'My Properties' : roomTab);

  // Mirror tab + picked room into the URL so refresh and sharing keep the place.
  useEffect(() => {
    if (bounceToConsole) return; // redirecting — don't fight it with a mirror write
    const params = new URLSearchParams();
    if (activeTab !== 'Home' && activeTab !== 'Live View') params.set('tab', TAB_SLUGS[activeTab]);
    // Admins keep ?tab=live off the overview: a reload must still read as an
    // explicit live visit, not bounce them back to the console.
    if (isAdmin && activeTab !== 'Home') params.set('tab', TAB_SLUGS[roomTab]);
    if (pick) {
      params.set('pid', pick.propertyId);
      params.set('rid', pick.roomId);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activeTab, roomTab, pick, router, pathname, bounceToConsole, isAdmin]);

  if (sessionState.status !== 'signed-in') return null;
  if (bounceToConsole) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-2">Opening the admin console…</p>
      </main>
    );
  }
  const { email, role } = sessionState.session;
  const goHome = () => {
    setPick(null);
    setActiveTab('Home');
  };
  const openRoom = (room: RoomRef) => {
    setPick({ propertyId: room.propertyId, roomId: room.roomId });
    setActiveTab('Live View');
  };
  const headerTitle = overviewShowing
    ? 'My Properties'
    : roomTab === 'Live View'
      ? 'Live 3D Room View'
      : roomTab;

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
              {headerTitle}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <NotificationBell />

            <ProfileMenu email={email} role={role} onSignOut={() => gateway.signOut()} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RoomArea
            activeTab={activeTab}
            pick={pick}
            onOpenRoom={openRoom}
            onBackHome={goHome}
            onOverviewChange={setOverviewShowing}
          />
        </div>
      </main>
    </div>
  );
}

/**
 * The top-right avatar opens an account menu — it does NOT sign out on click
 * (owner-reported: a single click on the profile icon logged you straight out).
 * Sign out is now an explicit item inside the menu.
 */
function ProfileMenu({
  email,
  role,
  onSignOut,
}: {
  email: string | null;
  role: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${email ?? 'Account'} (${role})`}
        className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-brand-soft ring-2 ring-white"
      >
        <img
          src="https://api.dicebear.com/7.x/notionists/svg?seed=ecostay"
          alt=""
          className="h-full w-full object-cover"
        />
      </button>
      {open && (
        <div
          role="menu"
          className="glass absolute right-0 top-12 z-50 w-60 rounded-2xl bg-white/90 p-2 shadow-xl"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-bold text-ink">{email ?? 'Signed in'}</p>
            <p className="mt-0.5 text-xs font-medium capitalize text-ink-3">Signed in as {role}</p>
          </div>
          <div className="my-1 border-t border-hairline" />
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-brand-soft"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      )}
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
