'use client';

import { ReactNode, useEffect, useState } from 'react';
import {
  DEVICE_COMMAND_KEYS,
  DEVICE_COMMAND_LABELS,
  DeviceCommandKey,
  DeviceCommands,
  GAS_ALARM_THRESHOLD,
  OCCUPANCY_STATES,
  OccupancyState,
} from '@/telemetry/contract';
import { deviceFreshness } from '@/telemetry/device-freshness';
import { isOccupied } from '@/telemetry/is-occupied';
import { EnergyHistorySection } from './energy-charts';
import type { RoomLatest } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';
import { RoomScene } from './room-scene';
import { Badge } from '@/ui/badge';
import { Toggle } from '@/ui/toggle';

type ViewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; latest: RoomLatest | null };

function ageLabel(ageSeconds: number | null): string {
  if (ageSeconds === null) return 'unknown';
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
  return `${Math.floor(ageSeconds / 3600)}h ago`;
}

/** One possibly-missing value → display string. RTDB fields can be absent at runtime. */
function reading(value: number | undefined, unit: string): string {
  return value === undefined ? '—' : `${value} ${unit}`;
}

/** Boolean field → label, tolerating a missing value. */
function flag(value: boolean | undefined, onLabel: string, offLabel: string): string {
  if (value === undefined) return '—';
  return value ? onLabel : offLabel;
}

function Group({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <section className="glass rounded-[1.25rem] p-5 shadow-sm">
      <h3 className="mb-4 flex items-center justify-between text-sm font-bold text-ink">
        {title}
        {badge && <Badge tone="warn">{badge}</Badge>}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </section>
  );
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-medium text-ink-3 uppercase tracking-wider">{label}</dt>
      <dd className="text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
        {children}
      </dd>
    </div>
  );
}

/**
 * Risk gate #3 (approved 2026-07-04): switches show the COMMANDED state from
 * devices/* — no invented acks. Disabled offline (no queued commands, ever).
 */
export function DeviceControls({
  propertyId,
  roomId,
  online,
  gasAlarm,
  relayActual,
}: {
  propertyId: string;
  roomId: string;
  online: boolean;
  gasAlarm: boolean;
  relayActual: boolean | undefined;
}) {
  const source = useRoomDataSource();
  const [commands, setCommands] = useState<DeviceCommands | null>(null);
  const [automationEnabled, setAutomationEnabledState] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return source.subscribeDeviceCommands(propertyId, roomId, setCommands);
  }, [source, propertyId, roomId]);

  useEffect(() => {
    return source.subscribeAutomationEnabled(propertyId, roomId, setAutomationEnabledState);
  }, [source, propertyId, roomId]);

  const disabled = !online || commands === null;

  async function toggle(key: DeviceCommandKey) {
    setError(null);
    try {
      await source.setDeviceCommand(propertyId, roomId, key, !(commands?.[key] ?? false));
    } catch {
      setError('Command failed — the device state was not changed.');
    }
  }

  async function toggleAutomation() {
    setError(null);
    try {
      await source.setAutomationEnabled(propertyId, roomId, !automationEnabled);
    } catch {
      setError('Command failed — the device state was not changed.');
    }
  }

  return (
    <section className="glass rounded-[1.25rem] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-ink">
        Device Controls
      </h3>
      {!online && (
        <p className="mb-3 rounded-lg bg-ink-3/10 px-3 py-2 text-xs text-ink-2">
          Controls disabled while offline.
        </p>
      )}
      <div className="grid gap-3">
        {DEVICE_COMMAND_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-ink">
              {DEVICE_COMMAND_LABELS[key]}
              {key === 'motionDetection' && (
                <span className="ml-2 rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink-3">
                  Actual: {relayActual === undefined ? '—' : relayActual ? 'On' : 'Off'}
                </span>
              )}
              {key === 'exhaustFan' && gasAlarm && (
                <span className="ml-2 text-[10px] font-bold uppercase text-alarm">
                  Forced on
                </span>
              )}
            </div>
            <Toggle
              checked={!!commands?.[key]}
              disabled={disabled}
              label={DEVICE_COMMAND_LABELS[key]}
              onToggle={() => toggle(key)}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <div className="text-sm font-medium text-ink">
          Vacancy cutoff automation
          <span className="block mt-0.5 text-xs font-normal text-ink-3">
            Turns off lights and fan when vacant.
          </span>
        </div>
        <Toggle
          checked={automationEnabled === true}
          disabled={automationEnabled === null}
          label="Vacancy cutoff automation"
          onToggle={toggleAutomation}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-alarm">
          {error}
        </p>
      )}
    </section>
  );
}

export function RoomLiveView({
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

  // 1 s heartbeat so staleness advances (and flips to offline) without new writes.
  useEffect(() => {
    const timer = setInterval(() => setLocalNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (state.status === 'loading') {
    return <p className="text-sm text-ink-2">Loading room…</p>;
  }

  if (state.status === 'error') {
    return (
      <div role="alert" className="glass mx-auto mt-16 max-w-md rounded-2xl p-8 text-center text-sm text-ink-2">
        Couldn&apos;t load live data for this room — check your connection and refresh.
      </div>
    );
  }

  if (state.latest === null) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-ink-2">
        This room has never reported. Check that the device is powered and online.
      </div>
    );
  }

  const latest = state.latest;
  // A state outside the firmware contract gets '—', never a guessed Occupied/Vacant.
  const knownState = OCCUPANCY_STATES.includes(latest.occupancyState as OccupancyState)
    ? (latest.occupancyState as OccupancyState)
    : undefined;
  const occupancySummary =
    knownState === undefined ? '—' : isOccupied(knownState) ? 'Occupied' : 'Vacant';

  // Freshness on the SERVER-corrected clock — never raw Date.now() (issue 04 field evidence).
  const freshness = deviceFreshness(latest.updatedAt, localNowMs + offsetMs);
  const gasAlarm = latest.gas !== undefined && latest.gas > GAS_ALARM_THRESHOLD;

  return (
    <section aria-label={`Live view of ${roomName ?? roomId}`} className="relative h-full w-full overflow-hidden bg-transparent">

      {/* Background 3D Scene */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none p-12">
        <div className="w-full max-w-5xl opacity-100 pointer-events-auto">
          <RoomScene latest={latest} online={freshness.online} />
        </div>
      </div>

      {/* Floating Status Header (Overrides page.tsx title somewhat, but nice for status) */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center gap-1">
        <span className="text-sm font-bold tracking-tight text-ink">{roomName ?? roomId}</span>
        <span className="text-[11px] font-medium text-ink-3">{propertyName ?? propertyId}</span>
        <div className="mt-0.5">
        {gasAlarm ? (
          <div role="status" className="rounded-full bg-alarm px-6 py-2 shadow-lg text-sm font-bold text-white uppercase tracking-wider animate-pulse">
            Gas alarm active — {latest.gas} ppm
          </div>
        ) : !freshness.online ? (
          <div role="status" className="rounded-full bg-ink px-6 py-2 shadow-lg text-sm font-bold text-white uppercase tracking-wider opacity-80">
            Offline — last seen {ageLabel(freshness.ageSeconds)}
          </div>
        ) : (
          <div role="status" className="rounded-full bg-white/60 backdrop-blur-md px-6 py-2 shadow-sm text-xs font-bold text-ink-2 uppercase tracking-wider border border-white">
            Status: {occupancySummary}
          </div>
        )}
        </div>
      </div>

      {/* Overlay Content */}
      <div
        className={`absolute inset-0 z-10 flex flex-col justify-between p-6 pointer-events-none overflow-y-auto transition-opacity ${!freshness.online ? 'opacity-70' : ''}`}
        data-stale={freshness.online ? undefined : 'true'}
      >

        {/* Top layer widgets — stack full-width on phones (fixed w-72 columns clipped at 390px) */}
        <div className="flex justify-between items-start pt-16 max-sm:flex-col max-sm:gap-5 max-sm:pt-14">
          {/* Left Widgets */}
          <div className="flex flex-col gap-5 w-72 max-sm:w-full pointer-events-auto">
            <Group title="Activity">
              <Value label="Door">{flag(latest.doorOpen, 'Open', 'Closed')}</Value>
              <Value label="Motion">{flag(latest.motionDetected, 'Detected', 'None')}</Value>
              <Value label="Presence">{flag(latest.humanPresent, 'Present', 'Away')}</Value>
            </Group>
            <Group title="Water">
              <Value label="Tank level">{reading(latest.waterLevel, '%')}</Value>
              <Value label="Flow">{reading(latest.flowRate, 'L/min')}</Value>
              <Value label="Usage">{reading(latest.totalLiters, 'L')}</Value>
            </Group>
            <Group title="Safety">
              <Value label="Gas Level">{reading(latest.gas, 'ppm')}</Value>
            </Group>
          </div>

          {/* Right Widgets */}
          <div className="flex flex-col gap-5 w-72 max-sm:w-full pointer-events-auto">
            <Group title="Lighting & Relays">
              <Value label="Presence relay">{flag(latest.relayStatus, 'On', 'Off')}</Value>
              <Value label="Buzzer">{flag(latest.buzzerStatus, 'On', 'Off')}</Value>
              <Value label="Light level">No sensor</Value>
            </Group>
            <Group title="Climate Control">
              <Value label="Temperature">{reading(latest.temperature, '°C')}</Value>
              <Value label="Humidity">{reading(latest.humidity, '%')}</Value>
            </Group>
            <Group title="Power Usage" badge="Simulated">
              <Value label="Power">{reading(latest.power, 'W')}</Value>
              <Value label="Energy">{reading(latest.energy, 'kWh')}</Value>
              <Value label="Voltage">{reading(latest.voltage, 'V')}</Value>
              <Value label="Current">{reading(latest.current, 'A')}</Value>
            </Group>
          </div>
        </div>

        {/* Bottom layer widgets */}
        <div className="flex justify-between items-end mt-auto pointer-events-auto gap-5 pt-8 pb-4 max-sm:flex-col max-sm:items-stretch">
          <div className="w-80 max-sm:w-full">
            <DeviceControls propertyId={propertyId} roomId={roomId} online={freshness.online} gasAlarm={gasAlarm} relayActual={latest.relayStatus} />
          </div>
          <div className="flex-1 max-w-2xl glass rounded-[1.25rem] shadow-sm overflow-hidden p-2">
            <EnergyHistorySection propertyId={propertyId} roomId={roomId} />
          </div>
        </div>
      </div>
    </section >
  );
}
