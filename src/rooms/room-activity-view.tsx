'use client';

import { useEffect, useState } from 'react';
import type { RoomLatest } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';
import { deviceFreshness } from '@/telemetry/device-freshness';

type ViewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; latest: RoomLatest | null };

export function RoomActivityView({
  propertyId,
  roomId,
  roomName,
}: {
  propertyId: string;
  roomId: string;
  roomName?: string;
}) {
  const source = useRoomDataSource();
  const [state, setState] = useState<ViewState>({ status: 'loading' });
  const [offsetMs, setOffsetMs] = useState(0);
  const [localNowMs, setLocalNowMs] = useState(() => Date.now());

  useEffect(() => {
    return source.subscribeLatest(
      propertyId,
      roomId,
      (latest) => setState({ status: 'ready', latest }),
      () => setState({ status: 'error' }),
    );
  }, [source, propertyId, roomId]);

  useEffect(() => {
    return source.subscribeServerTimeOffset(setOffsetMs);
  }, [source]);

  useEffect(() => {
    const timer = setInterval(() => setLocalNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (state.status === 'loading') {
    return <div className="flex h-full w-full items-center justify-center p-12"><p className="text-sm text-ink-2">Loading activity…</p></div>;
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center p-12">
        <div role="alert" className="glass rounded-2xl p-8 text-center text-sm text-ink-2">
          Couldn&apos;t load activity data — check your connection and refresh.
        </div>
      </div>
    );
  }

  if (state.latest === null) {
    return (
      <div className="flex h-full w-full items-center justify-center p-12">
        <div className="glass rounded-2xl p-8 text-center text-sm text-ink-2">
          This room has no reported activity.
        </div>
      </div>
    );
  }

  const latest = state.latest;
  const freshness = deviceFreshness(latest.updatedAt, localNowMs + offsetMs);
  const doorOpen = latest.doorOpen === true;
  const motion = latest.motionDetected === true;
  const presence = latest.humanPresent === true;

  return (
    <section aria-label={`Activity in ${roomName ?? roomId}`} className="relative h-full w-full overflow-hidden bg-transparent">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 bg-gradient-to-tr from-brand/5 to-transparent opacity-50" />

      <div className="absolute left-1/2 top-4 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center gap-1">
        <span className="text-sm font-bold tracking-tight text-ink">{roomName ?? roomId}</span>
        <span className="text-[11px] font-medium text-ink-3">Activity & Telemetry</span>
      </div>

      <div className="relative z-10 flex h-full flex-col p-6 pt-24 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl">
          
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-ink">Recent Activity</h2>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${freshness.online ? 'bg-success shadow-[0_0_8px_rgba(21,128,61,0.5)]' : 'bg-alarm'}`} />
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                {freshness.online ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="glass flex flex-col justify-between rounded-[1.25rem] p-6 shadow-sm bg-white/60">
              <span className="text-sm font-medium text-ink-3 uppercase tracking-wider">Door Status</span>
              <div className="mt-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${doorOpen ? 'bg-warnbrand-soft text-warnbrand' : 'bg-success-soft text-success'}`}>
                  {doorOpen ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M9 15h1"></path></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  )}
                </div>
                <span className="text-lg font-bold text-ink">{doorOpen ? 'Open' : 'Closed'}</span>
              </div>
            </div>

            <div className="glass flex flex-col justify-between rounded-[1.25rem] p-6 shadow-sm bg-white/60">
              <span className="text-sm font-medium text-ink-3 uppercase tracking-wider">Motion Detected</span>
              <div className="mt-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${motion ? 'bg-brand/10 text-brand' : 'bg-ink-3/10 text-ink-3'}`}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                </div>
                <span className="text-lg font-bold text-ink">{motion ? 'Yes' : 'No'}</span>
              </div>
            </div>

            <div className="glass flex flex-col justify-between rounded-[1.25rem] p-6 shadow-sm bg-white/60">
              <span className="text-sm font-medium text-ink-3 uppercase tracking-wider">Micro-Presence</span>
              <div className="mt-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${presence ? 'bg-brand/10 text-brand' : 'bg-ink-3/10 text-ink-3'}`}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="10" r="3"></circle><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"></path></svg>
                </div>
                <span className="text-lg font-bold text-ink">{presence ? 'Detected' : 'Clear'}</span>
              </div>
            </div>

            <div className="glass flex flex-col justify-between rounded-[1.25rem] p-6 shadow-sm bg-white/60">
              <span className="text-sm font-medium text-ink-3 uppercase tracking-wider">Inferred Occupancy</span>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-lg font-bold text-ink">
                  {latest.occupancyState ?? 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-dashed border-ink-3/20 p-6 text-center">
            <p className="text-sm font-medium text-ink-2">Activity History Log</p>
            <p className="mt-1 text-xs text-ink-3">A timeline of recent activities will appear here in future updates.</p>
          </div>

        </div>
      </div>
    </section>
  );
}
