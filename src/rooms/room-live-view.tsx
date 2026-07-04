'use client';

import { ReactNode, useEffect, useState } from 'react';
import { GAS_ALARM_THRESHOLD, OCCUPANCY_STATES, OccupancyState } from '@/telemetry/contract';
import { isOccupied } from '@/telemetry/is-occupied';
import type { RoomLatest } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';

type ViewState = { status: 'loading' } | { status: 'ready'; latest: RoomLatest | null };

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
    <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
        {badge && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {badge}
          </span>
        )}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>
    </section>
  );
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
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

  useEffect(() => {
    return source.subscribeLatest(propertyId, roomId, (latest) =>
      setState({ status: 'ready', latest }),
    );
  }, [source, propertyId, roomId]);

  if (state.status === 'loading') {
    return <p className="text-sm text-zinc-500">Loading room…</p>;
  }

  if (state.latest === null) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
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

  return (
    <section aria-label={`Live view of ${roomName ?? roomId}`} className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {roomName ?? roomId}
        </h2>
        <div className="text-right">
          <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            {occupancySummary}
          </p>
          <p className="text-xs text-zinc-500">{latest.occupancyState ?? 'no state reported'}</p>
        </div>
      </header>

      {latest.gas !== undefined && latest.gas > GAS_ALARM_THRESHOLD && (
        <p
          role="alert"
          className="rounded-md bg-red-100 px-3 py-2 text-sm font-semibold text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          Gas alarm — {latest.gas} ppm (threshold {GAS_ALARM_THRESHOLD})
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
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
    </section>
  );
}
