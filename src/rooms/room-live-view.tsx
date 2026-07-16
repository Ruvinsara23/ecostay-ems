'use client';

import { Droplets, Fan, Flame, Lightbulb, type LucideIcon, Radar, Thermometer } from 'lucide-react';
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
import { DEFAULT_ALERT_THRESHOLDS } from '@/alerts/thresholds';
import { deviceFreshness } from '@/telemetry/device-freshness';
import { isOccupied } from '@/telemetry/is-occupied';
import { EnergyHistorySection } from './energy-charts';
import type { RoomLatest } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';
import { RoomScene } from './room-scene';
import { Badge } from '@/ui/badge';
import { ArcGauge, TankGauge } from '@/ui/gauge';
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

/** A glass card with an icon-chip header + subtitle — the richer sensor-gauge shell. */
function SensorCard({
  icon: Icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="glass rounded-[1.25rem] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand-deep">
          <Icon size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold leading-tight text-ink">{title}</h3>
          <p className="text-[11px] font-medium text-ink-3">{subtitle}</p>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

/** A big centered number tile (the two readouts beside a gauge). */
function BigTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-well/60 p-3 text-center">
      <div className="text-2xl font-bold leading-tight text-ink [font-variant-numeric:tabular-nums]">
        {children}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  );
}

type StateTone = 'brand' | 'success' | 'warn' | 'danger' | 'neutral';

function waterState(level: number | undefined, low: number): { label: string; tone: StateTone } {
  if (level === undefined) return { label: 'Unknown', tone: 'neutral' };
  if (level <= 0) return { label: 'Empty', tone: 'danger' };
  if (level < low) return { label: 'Low', tone: 'warn' };
  if (level >= 80) return { label: 'Full', tone: 'success' };
  return { label: 'OK', tone: 'success' };
}

/** Water Tank card — vertical fill gauge + level/flow readouts + tank-state pill. */
function WaterCard({ latest }: { latest: RoomLatest }) {
  const low = DEFAULT_ALERT_THRESHOLDS.waterLevelPct;
  const level = latest.waterLevel;
  const state = waterState(level, low);
  return (
    <SensorCard icon={Droplets} title="Water Tank" subtitle="Level & Flow Rate">
      <div className="mx-auto w-28">
        <TankGauge level={level} lowThreshold={low} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <BigTile label="Tank Level">{level === undefined ? '—' : `${level}%`}</BigTile>
        <BigTile label="L/min Flow">{latest.flowRate === undefined ? '—' : latest.flowRate}</BigTile>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-full bg-well/70 px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Tank state</span>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <p className="mt-2 text-center text-[11px] text-ink-3">
        Usage since reboot: {reading(latest.totalLiters, 'L')}
      </p>
    </SensorCard>
  );
}

/** Air-safety card — a gas dial with the firmware's 300 ppm alarm line. */
function SafetyCard({ latest }: { latest: RoomLatest }) {
  const alarm = latest.gas !== undefined && latest.gas > GAS_ALARM_THRESHOLD;
  return (
    <SensorCard
      icon={Flame}
      title="Air Safety"
      subtitle="Combustible Gas"
      badge={alarm ? <Badge tone="danger">Alarm</Badge> : undefined}
    >
      <div className="mx-auto w-44">
        <ArcGauge
          value={latest.gas}
          max={1000}
          unit="ppm"
          threshold={GAS_ALARM_THRESHOLD}
          thresholdDirection="above"
        />
      </div>
      <p className="mt-1 text-center text-[11px] text-ink-3">Alarm above {GAS_ALARM_THRESHOLD} ppm</p>
    </SensorCard>
  );
}

/** Climate card — temperature + humidity dials. */
function ClimateCard({ latest }: { latest: RoomLatest }) {
  return (
    <SensorCard icon={Thermometer} title="Climate" subtitle="Temperature & Humidity">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <ArcGauge
            value={latest.temperature}
            min={0}
            max={50}
            unit="°C"
            threshold={DEFAULT_ALERT_THRESHOLDS.temperatureC}
            thresholdDirection="above"
          />
          <p className="mt-0.5 text-center text-[11px] font-medium uppercase tracking-wider text-ink-3">
            Temp
          </p>
        </div>
        <div>
          <ArcGauge value={latest.humidity} min={0} max={100} unit="%" />
          <p className="mt-0.5 text-center text-[11px] font-medium uppercase tracking-wider text-ink-3">
            Humidity
          </p>
        </div>
      </div>
    </SensorCard>
  );
}

const DEVICE_ICONS: Record<DeviceCommandKey, LucideIcon> = {
  lights: Lightbulb,
  exhaustFan: Fan,
  waterPump: Droplets,
  motionDetection: Radar,
};

/** One device as a tappable tile: icon, name, ON/OFF state, and the in-flight note. */
function DeviceTile({
  label,
  Icon,
  on,
  pending,
  disabled,
  note,
  onToggle,
}: {
  label: string;
  Icon: LucideIcon;
  on: boolean;
  pending: boolean;
  disabled: boolean;
  note?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`flex flex-col gap-2.5 rounded-2xl border p-3.5 text-left transition-colors disabled:opacity-50 ${
        on ? 'border-brand/40 bg-brand-soft' : 'border-hairline bg-white/60 hover:bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${on ? 'bg-brand text-white' : 'bg-well text-ink-3'}`}
        >
          <Icon size={18} strokeWidth={2.2} aria-hidden />
        </span>
        {/* Visual switch — the whole tile is the control (bigger tap target). */}
        <span
          aria-hidden
          className={`relative h-6 w-11 flex-none rounded-full transition-colors ${on ? 'bg-brand' : 'bg-ink-3/25'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </span>
      </div>
      <div className="min-w-0">
        <span className="block truncate text-sm font-bold text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wide">
          {pending ? (
            <span className="text-ink-3">Saving…</span>
          ) : on ? (
            <span className="text-brand-deep">On</span>
          ) : (
            <span className="text-ink-3">Off</span>
          )}
          {note && <span className="ml-1.5 font-semibold normal-case text-ink-3">{note}</span>}
        </span>
      </div>
    </button>
  );
}

/**
 * Risk gate #3 (approved 2026-07-04): switches show the COMMANDED state from
 * devices/* — no invented acks. Disabled offline (no queued commands, ever).
 * Tapping is optimistic (Saving…) and then follows the subscription echo.
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
  const [pending, setPending] = useState<Partial<Record<DeviceCommandKey, boolean>>>({});
  const [automationEnabled, setAutomationEnabledState] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return source.subscribeDeviceCommands(propertyId, roomId, (next) => {
      setCommands(next);
      // Clear each optimistic flag as the live state confirms its requested value.
      setPending((prev) => {
        const keys = Object.keys(prev) as DeviceCommandKey[];
        if (keys.length === 0) return prev;
        let changed = false;
        const out = { ...prev };
        for (const key of keys) {
          if ((next[key] ?? false) === prev[key]) {
            delete out[key];
            changed = true;
          }
        }
        return changed ? out : prev;
      });
    });
  }, [source, propertyId, roomId]);

  useEffect(() => {
    return source.subscribeAutomationEnabled(propertyId, roomId, setAutomationEnabledState);
  }, [source, propertyId, roomId]);

  const disabled = !online || commands === null;

  async function toggle(key: DeviceCommandKey) {
    setError(null);
    const desired = !(commands?.[key] ?? false);
    setPending((prev) => ({ ...prev, [key]: desired }));
    try {
      await source.setDeviceCommand(propertyId, roomId, key, desired);
    } catch {
      setError('Command failed — the device state was not changed.');
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
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

  function noteFor(key: DeviceCommandKey): string | undefined {
    if (key === 'motionDetection') {
      return `Actual: ${relayActual === undefined ? '—' : relayActual ? 'On' : 'Off'}`;
    }
    if (key === 'exhaustFan' && gasAlarm) return 'Forced on';
    return undefined;
  }

  return (
    <section className="glass rounded-[1.25rem] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-ink">Device Controls</h3>
      {!online && (
        <p className="mb-3 rounded-lg bg-ink-3/10 px-3 py-2 text-xs text-ink-2">
          Controls disabled while offline.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {DEVICE_COMMAND_KEYS.map((key) => (
          <DeviceTile
            key={key}
            label={DEVICE_COMMAND_LABELS[key]}
            Icon={DEVICE_ICONS[key]}
            on={pending[key] ?? !!commands?.[key]}
            pending={pending[key] !== undefined}
            disabled={disabled}
            note={noteFor(key)}
            onToggle={() => toggle(key)}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <div className="text-sm font-medium text-ink">
          Vacancy cutoff automation
          <span className="mt-0.5 block text-xs font-normal text-ink-3">
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
            <WaterCard latest={latest} />
            <SafetyCard latest={latest} />
          </div>

          {/* Right Widgets */}
          <div className="flex flex-col gap-5 w-72 max-sm:w-full pointer-events-auto">
            <Group title="Lighting & Relays">
              <Value label="Presence relay">{flag(latest.relayStatus, 'On', 'Off')}</Value>
              <Value label="Buzzer">{flag(latest.buzzerStatus, 'On', 'Off')}</Value>
              <Value label="Light level">No sensor</Value>
            </Group>
            <ClimateCard latest={latest} />
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
