'use client';

import { useEffect, useState } from 'react';
import { GAS_ALARM_THRESHOLD } from '@/telemetry/contract';
import { deviceFreshness } from '@/telemetry/device-freshness';
import type { RoomLatest } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';
import { DeviceControls } from './room-live-view';
import { RoomScene } from './room-scene';

type ViewState = { status: 'loading' } | { status: 'ready'; latest: RoomLatest | null };

export function RoomDevicesView({
  propertyId,
  roomId,
  roomName,
  propertyName,
}: {
  propertyId: string;
  roomId: string;
  roomName?: string;
  propertyName?: string;
}) {
  const source = useRoomDataSource();
  const [state, setState] = useState<ViewState>({ status: 'loading' });
  const [offsetMs, setOffsetMs] = useState(0);
  const [localNowMs, setLocalNowMs] = useState(() => Date.now());

  useEffect(() => {
    return source.subscribeLatest(propertyId, roomId, (latest) =>
      setState({ status: 'ready', latest }),
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
    return <div className="flex h-full w-full items-center justify-center p-12"><p className="text-sm text-ink-2">Loading devices…</p></div>;
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

  return (
    <section aria-label={`Devices in ${roomName ?? roomId}`} className="relative h-full w-full overflow-hidden bg-transparent">
      {/* Background 3D Scene (dimmed for focus on devices) */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none p-12 opacity-40">
        <div className="w-full max-w-5xl">
          <RoomScene latest={latest} online={freshness.online} />
        </div>
      </div>

      <div className="absolute left-1/2 top-4 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center gap-1">
        <span className="text-sm font-bold tracking-tight text-ink">{roomName ?? roomId}</span>
        <span className="text-[11px] font-medium text-ink-3">Devices View</span>
      </div>

      {/* Overlay Content */}
      <div
        className={`absolute inset-0 z-10 flex flex-col p-6 overflow-y-auto transition-opacity ${!freshness.online ? 'opacity-70' : ''}`}
      >
        <div className="flex justify-center items-center mt-20 pointer-events-auto">
          <div className="w-full max-w-md shadow-lg glass rounded-[1.25rem] bg-white/40">
            <DeviceControls propertyId={propertyId} roomId={roomId} online={freshness.online} gasAlarm={gasAlarm} relayActual={latest.relayStatus} />
          </div>
        </div>
      </div>
    </section>
  );
}
