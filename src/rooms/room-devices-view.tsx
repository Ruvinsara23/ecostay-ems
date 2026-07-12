'use client';

import { useEffect, useState } from 'react';
import { GAS_ALARM_THRESHOLD } from '@/telemetry/contract';
import { deviceFreshness } from '@/telemetry/device-freshness';
import type { RoomLatest } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';
import { DeviceControls } from './room-live-view';

type ViewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; latest: RoomLatest | null };

export function RoomDevicesView({
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
    return (
      <div className="flex h-full w-full items-center justify-center p-12">
        <p className="text-sm text-ink-2">Loading devices…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center p-12">
        <div role="alert" className="glass rounded-2xl p-8 text-center text-sm text-ink-2">
          Couldn&apos;t load device data — check your connection and refresh.
        </div>
      </div>
    );
  }

  if (state.latest === null) {
    return (
      <div className="flex h-full w-full items-center justify-center p-12">
        <div className="glass rounded-2xl p-8 text-center text-sm text-ink-2">
          This room has no reported devices.
        </div>
      </div>
    );
  }

  const latest = state.latest;
  const freshness = deviceFreshness(latest.updatedAt, localNowMs + offsetMs);
  const gasAlarm = latest.gas !== undefined && latest.gas > GAS_ALARM_THRESHOLD;

  // A flat, readable surface — NOT the dimmed 3D scene the controls used to float
  // over (owner-reported: unreadable). The 3D room belongs to Live View only.
  return (
    <section
      aria-label={`Devices in ${roomName ?? roomId}`}
      className="relative h-full w-full overflow-y-auto bg-transparent"
    >
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-brand/5 to-transparent opacity-50" />

      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1">
        <span className="text-sm font-bold tracking-tight text-ink">{roomName ?? roomId}</span>
        <span className="text-[11px] font-medium text-ink-3">Devices View</span>
      </div>

      <div className="relative z-10 flex flex-col p-6 pt-24">
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-4 flex items-center justify-end gap-2">
            <span
              className={`h-2 w-2 rounded-full ${freshness.online ? 'bg-success' : 'bg-alarm'}`}
              aria-hidden
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
              {freshness.online ? 'Online' : 'Offline'}
            </span>
          </div>
          <DeviceControls
            propertyId={propertyId}
            roomId={roomId}
            online={freshness.online}
            gasAlarm={gasAlarm}
            relayActual={latest.relayStatus}
          />
        </div>
      </div>
    </section>
  );
}
