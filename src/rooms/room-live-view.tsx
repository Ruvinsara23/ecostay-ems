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

type ViewState = { status: 'loading' } | { status: 'ready'; latest: RoomLatest | null };

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
    <section className="glass rounded-2xl p-4">
      <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        {title}
        {badge && (
          <span className="rounded-md bg-warnbrand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warnbrand">
            {badge}
          </span>
        )}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">{children}</dl>
    </section>
  );
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="text-sm font-semibold text-ink [font-variant-numeric:tabular-nums]">
        {children}
      </dd>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-brand' : 'bg-ink/15'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Risk gate #3 (approved 2026-07-04): switches show the COMMANDED state from
 * devices/* — no invented acks. Disabled offline (no queued commands, ever).
 */
function DeviceControls({
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
    <section className="glass rounded-2xl p-4">
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        Controls
      </h3>
      {!online && (
        <p className="mb-2 text-xs text-ink-2">
          Controls disabled while offline — a queued command would apply unpredictably when
          the device reconnects.
        </p>
      )}
      <div className="grid gap-2.5">
        {DEVICE_COMMAND_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="text-sm text-ink">
              {DEVICE_COMMAND_LABELS[key]}
              {key === 'motionDetection' && (
                <span className="ml-2 text-xs text-ink-3">
                  Actual: {relayActual === undefined ? '—' : relayActual ? 'On' : 'Off'}
                </span>
              )}
              {key === 'exhaustFan' && gasAlarm && (
                <span className="ml-2 text-xs font-semibold text-alarm">
                  Forced on by device during the alarm
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
      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-hairline pt-3.5">
        <div className="text-sm text-ink">
          Vacancy cutoff automation
          <span className="block text-xs text-ink-3">
            Turns off lights and fan when the room is confirmed vacant.
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
        <p role="alert" className="mt-2 text-xs font-semibold text-alarm">
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
    return source.subscribeLatest(propertyId, roomId, (latest) =>
      setState({ status: 'ready', latest }),
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
    <section aria-label={`Live view of ${roomName ?? roomId}`} className="flex flex-col gap-3.5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[22px] font-light tracking-tight text-ink">
            <b className="font-bold">{roomName ?? roomId}</b>
          </h2>
          {freshness.online ? (
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
              Live · {ageLabel(freshness.ageSeconds)}
            </p>
          ) : (
            <p
              role="status"
              className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-alarm-soft px-2.5 py-0.5 text-xs font-bold text-alarm"
            >
              Offline — last seen {ageLabel(freshness.ageSeconds)}
            </p>
          )}
        </div>
        <div className="flex-none text-right">
          <p
            className={`text-lg font-bold tracking-tight ${
              occupancySummary === 'Occupied' ? 'text-brand-deep' : 'text-ink'
            }`}
          >
            {occupancySummary}
          </p>
          <p className="text-[11px] font-semibold tracking-wide text-ink-3">
            {latest.occupancyState ?? 'no state reported'}
          </p>
        </div>
      </header>

      {gasAlarm && (
        <p
          role="alert"
          className="rounded-xl bg-alarm-soft px-4 py-2.5 text-sm font-bold text-alarm"
        >
          Gas alarm — {latest.gas} ppm (threshold {GAS_ALARM_THRESHOLD})
        </p>
      )}

      <div className="glass rounded-2xl p-1.5">
        <RoomScene latest={latest} online={freshness.online} />
      </div>

      <div
        data-stale={freshness.online ? undefined : 'true'}
        className={`grid gap-3.5 sm:grid-cols-2 ${freshness.online ? '' : 'opacity-50'}`}
      >
        <Group title="Climate">
          <Value label="Temperature">{reading(latest.temperature, '°C')}</Value>
          <Value label="Humidity">{reading(latest.humidity, '%')}</Value>
        </Group>

        <Group title="Power" badge="Simulated">
          <Value label="Power">{reading(latest.power, 'W')}</Value>
          <Value label="Energy">{reading(latest.energy, 'kWh')}</Value>
          <Value label="Voltage">{reading(latest.voltage, 'V')}</Value>
          <Value label="Current">{reading(latest.current, 'A')}</Value>
        </Group>

        <Group title="Safety">
          <Value label="Gas">{reading(latest.gas, 'ppm')}</Value>
          <Value label="Buzzer">{flag(latest.buzzerStatus, 'On', 'Off')}</Value>
        </Group>

        <Group title="Water">
          <Value label="Tank level">{reading(latest.waterLevel, '%')}</Value>
          <Value label="Flow">{reading(latest.flowRate, 'L/min')}</Value>
          <Value label="Used since boot">{reading(latest.totalLiters, 'L')}</Value>
        </Group>

        <Group title="Activity">
          <Value label="Door">{flag(latest.doorOpen, 'Open', 'Closed')}</Value>
          <Value label="Motion">{flag(latest.motionDetected, 'Detected', 'None')}</Value>
          <Value label="Human presence">{flag(latest.humanPresent, 'Present', 'Away')}</Value>
        </Group>

        <Group title="Relays">
          <Value label="Presence relay">{flag(latest.relayStatus, 'On', 'Off')}</Value>
          <Value label="Light level">No sensor</Value>
        </Group>
      </div>

      <EnergyHistorySection propertyId={propertyId} roomId={roomId} />

      <DeviceControls
        propertyId={propertyId}
        roomId={roomId}
        online={freshness.online}
        gasAlarm={gasAlarm}
        relayActual={latest.relayStatus}
      />
    </section>
  );
}
