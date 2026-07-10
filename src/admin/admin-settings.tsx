'use client';

import { Bell, Gauge, Save, Zap } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { DEFAULT_ALERT_THRESHOLDS, type AlertThresholds } from '@/alerts/thresholds';
import { useAuth } from '@/auth/auth-context';
import type { CircuitWattages } from '@/rooms/room-data-source';
import { useRoomDataSource } from '@/rooms/room-data-source-context';
import { CEB_TARIFFS } from '@/tariff/ceb-tariffs';

type PropertyRef = { propertyId: string; propertyName?: string };

const fieldClass =
  'box-border w-full min-w-0 rounded-xl border border-hairline bg-white/70 px-3.5 py-2.5 font-normal text-ink outline-none transition focus:ring-2 focus:ring-brand';

const genericSaveError = 'Could not save - try again.';

function settingsSaveErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/permission|denied/i.test(message)) {
    return 'Save denied by Firebase rules. Check that you are signed in as admin and republish database.rules.json if rules changed.';
  }
  if (/network|offline|unavailable|timeout|failed to fetch/i.test(message)) {
    return 'Could not reach Firebase. Check the network and try again.';
  }
  return genericSaveError;
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
          {icon}
        </span>
        <h2 className="text-sm font-bold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={fieldClass}
      />
    </label>
  );
}

export function AdminSettings() {
  const { sessionState } = useAuth();
  const source = useRoomDataSource();
  const session = sessionState.status === 'signed-in' ? sessionState.session : null;

  const [properties, setProperties] = useState<PropertyRef[] | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [category, setCategory] = useState('D-1');
  const [lights, setLights] = useState(0);
  const [exhaustFan, setExhaustFan] = useState(0);
  const [temperatureC, setTemperatureC] = useState(DEFAULT_ALERT_THRESHOLDS.temperatureC);
  const [waterLevelPct, setWaterLevelPct] = useState(DEFAULT_ALERT_THRESHOLDS.waterLevelPct);
  const [acPowerThresholdW, setAcPowerThresholdW] = useState(DEFAULT_ALERT_THRESHOLDS.acPowerThresholdW);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    source.listAccessibleRooms(session).then((rooms) => {
      if (cancelled) return;
      const byId = new Map<string, PropertyRef>();
      for (const r of rooms) {
        byId.set(r.propertyId, {
          propertyId: r.propertyId,
          propertyName: r.propertyName,
        });
      }
      const list = [...byId.values()];
      setProperties(list);
      setPropertyId((current) => current ?? list[0]?.propertyId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [source, session]);

  useEffect(() => {
    if (!propertyId) return;
    return source.subscribeTariffCategory(propertyId, (c) => c && setCategory(c));
  }, [source, propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    return source.subscribeCircuitWattages(propertyId, (w) => {
      if (w) {
        setLights(w.lights);
        setExhaustFan(w.exhaustFan);
      }
    });
  }, [source, propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    return source.subscribeAlertThresholds(propertyId, (thresholds) => {
      const next = thresholds ?? DEFAULT_ALERT_THRESHOLDS;
      setTemperatureC(next.temperatureC);
      setWaterLevelPct(next.waterLevelPct);
      setAcPowerThresholdW(next.acPowerThresholdW ?? DEFAULT_ALERT_THRESHOLDS.acPowerThresholdW);
    });
  }, [source, propertyId]);

  const activeName = useMemo(
    () => properties?.find((p) => p.propertyId === propertyId)?.propertyName ?? propertyId ?? '',
    [properties, propertyId],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!propertyId) return;
    setStatus('saving');
    setError(null);
    try {
      const wattages: CircuitWattages = { lights, exhaustFan };
      const thresholds: AlertThresholds = { temperatureC, waterLevelPct, acPowerThresholdW };
      await Promise.all([
        source.setTariffCategory(propertyId, category),
        source.setCircuitWattages(propertyId, wattages),
        source.setAlertThresholds(propertyId, thresholds),
      ]);
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError(settingsSaveErrorMessage(err));
    }
  }

  if (properties === null) {
    return <p className="p-8 text-sm text-ink-2">Loading...</p>;
  }
  if (properties.length === 0) {
    return (
      <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-8 text-center text-sm text-ink-2">
        No properties to manage yet.
      </div>
    );
  }

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              Admin / Settings
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{activeName}</h1>
          </div>
          {properties.length > 1 && (
            <label className="flex min-w-64 flex-col gap-1.5 text-sm font-semibold text-ink">
              Property
              <select
                value={propertyId ?? ''}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setStatus('idle');
                  setError(null);
                }}
                className={fieldClass}
              >
                {properties.map((property) => (
                  <option key={property.propertyId} value={property.propertyId}>
                    {property.propertyName ?? property.propertyId}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass box-border mt-6 flex w-full max-w-full flex-col gap-6 rounded-2xl p-5 sm:p-6"
        >
          <SettingsSection icon={<Gauge size={18} strokeWidth={2.2} />} title="Billing">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
              Tariff category
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setStatus('idle');
                  setError(null);
                }}
                className={fieldClass}
              >
                {Object.keys(CEB_TARIFFS).map((key) => (
                  <option key={key} value={key}>
                    {CEB_TARIFFS[key].category}
                  </option>
                ))}
              </select>
            </label>
          </SettingsSection>

          <SettingsSection icon={<Zap size={18} strokeWidth={2.2} />} title="Controlled circuits">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Lights (W)"
                min={0}
                value={lights}
                onChange={(value) => {
                  setLights(value);
                  setStatus('idle');
                  setError(null);
                }}
              />
              <NumberField
                label="Exhaust fan (W)"
                min={0}
                value={exhaustFan}
                onChange={(value) => {
                  setExhaustFan(value);
                  setStatus('idle');
                  setError(null);
                }}
              />
            </div>
          </SettingsSection>

          <SettingsSection icon={<Bell size={18} strokeWidth={2.2} />} title="Alert thresholds">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Temperature threshold (C)"
                min={0}
                max={50}
                value={temperatureC}
                onChange={(value) => {
                  setTemperatureC(value);
                  setStatus('idle');
                  setError(null);
                }}
              />
              <NumberField
                label="Water threshold (%)"
                min={0}
                max={100}
                value={waterLevelPct}
                onChange={(value) => {
                  setWaterLevelPct(value);
                  setStatus('idle');
                  setError(null);
                }}
              />
              <NumberField
                label="AC On Power threshold (W)"
                min={0}
                max={10000}
                value={acPowerThresholdW}
                onChange={(value) => {
                  setAcPowerThresholdW(value);
                  setStatus('idle');
                  setError(null);
                }}
              />
            </div>
          </SettingsSection>

          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
            <button
              type="submit"
              disabled={status === 'saving'}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep disabled:opacity-50"
            >
              <Save size={16} strokeWidth={2.4} aria-hidden />
              {status === 'saving' ? 'Saving...' : 'Save'}
            </button>
            {status === 'saved' && (
              <span className="text-sm font-semibold text-brand-deep">Saved</span>
            )}
            {status === 'error' && (
              <span role="alert" className="text-sm font-semibold text-alarm">
                {error ?? genericSaveError}
              </span>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
