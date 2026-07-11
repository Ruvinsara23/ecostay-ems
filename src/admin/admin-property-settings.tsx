'use client';

import { Bell, Gauge, Save, Zap } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { DEFAULT_ALERT_THRESHOLDS, type AlertThresholds } from '@/alerts/thresholds';
import type { CircuitWattages } from '@/rooms/room-data-source';
import { useRoomDataSource } from '@/rooms/room-data-source-context';
import { CEB_TARIFFS } from '@/tariff/ceb-tariffs';
import { fieldClass, NumberField } from '@/ui/field';

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

/**
 * Per-property settings (tariff, controlled circuits, alert thresholds) as a
 * detail-page section (admin-console-v2 slice 07). The property comes from the
 * route — no discovery, so a zero-room property is just as configurable.
 * Values load/save over the SAME RoomDataSource paths as before (unchanged,
 * approved write semantics); only where the form lives changed.
 */
export function AdminPropertySettings({ propertyId }: { propertyId: string }) {
  const source = useRoomDataSource();

  const [category, setCategory] = useState('D-1');
  const [lights, setLights] = useState(0);
  const [exhaustFan, setExhaustFan] = useState(0);
  const [temperatureC, setTemperatureC] = useState(DEFAULT_ALERT_THRESHOLDS.temperatureC);
  const [waterLevelPct, setWaterLevelPct] = useState(DEFAULT_ALERT_THRESHOLDS.waterLevelPct);
  const [acPowerThresholdW, setAcPowerThresholdW] = useState(
    DEFAULT_ALERT_THRESHOLDS.acPowerThresholdW,
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Save must never fire before the stored values arrive — clicking Save on the
  // unpopulated defaults would silently overwrite real config (review finding).
  const [loaded, setLoaded] = useState({ tariff: false, wattages: false, thresholds: false });
  const ready = loaded.tariff && loaded.wattages && loaded.thresholds;

  useEffect(() => {
    return source.subscribeTariffCategory(propertyId, (c) => {
      setCategory(c ?? 'D-1');
      setLoaded((l) => ({ ...l, tariff: true }));
    });
  }, [source, propertyId]);

  useEffect(() => {
    return source.subscribeCircuitWattages(propertyId, (w) => {
      setLights(w?.lights ?? 0);
      setExhaustFan(w?.exhaustFan ?? 0);
      setLoaded((l) => ({ ...l, wattages: true }));
    });
  }, [source, propertyId]);

  useEffect(() => {
    return source.subscribeAlertThresholds(propertyId, (thresholds) => {
      const next = thresholds ?? DEFAULT_ALERT_THRESHOLDS;
      setTemperatureC(next.temperatureC);
      setWaterLevelPct(next.waterLevelPct);
      setAcPowerThresholdW(next.acPowerThresholdW ?? DEFAULT_ALERT_THRESHOLDS.acPowerThresholdW);
      setLoaded((l) => ({ ...l, thresholds: true }));
    });
  }, [source, propertyId]);

  function touched<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setStatus('idle');
      setError(null);
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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

  if (!ready) {
    return (
      <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
        <p className="text-sm text-ink-2">Loading settings…</p>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass box-border mt-6 flex w-full max-w-full flex-col gap-6 rounded-2xl p-5 sm:p-6"
    >
      <SettingsSection icon={<Gauge size={18} strokeWidth={2.2} />} title="Billing">
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
          Tariff category
          <select
            value={category}
            onChange={(e) => touched(setCategory)(e.target.value)}
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
          <NumberField label="Lights (W)" min={0} value={lights} onChange={touched(setLights)} />
          <NumberField
            label="Exhaust fan (W)"
            min={0}
            value={exhaustFan}
            onChange={touched(setExhaustFan)}
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
            onChange={touched(setTemperatureC)}
          />
          <NumberField
            label="Water threshold (%)"
            min={0}
            max={100}
            value={waterLevelPct}
            onChange={touched(setWaterLevelPct)}
          />
          <NumberField
            label="AC On Power threshold (W)"
            min={0}
            max={10000}
            value={acPowerThresholdW}
            onChange={touched(setAcPowerThresholdW)}
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
        {status === 'saved' && <span className="text-sm font-semibold text-brand-deep">Saved</span>}
        {status === 'error' && (
          <span role="alert" className="text-sm font-semibold text-alarm">
            {error ?? genericSaveError}
          </span>
        )}
      </div>
    </form>
  );
}
