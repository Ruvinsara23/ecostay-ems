'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import type { CircuitWattages } from '@/rooms/room-data-source';
import { useRoomDataSource } from '@/rooms/room-data-source-context';
import { CEB_TARIFFS } from '@/tariff/ceb-tariffs';

type PropertyRef = { propertyId: string; propertyName?: string };

export function AdminSettings() {
  const { sessionState } = useAuth();
  const source = useRoomDataSource();
  const session = sessionState.status === 'signed-in' ? sessionState.session : null;

  const [properties, setProperties] = useState<PropertyRef[] | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [category, setCategory] = useState('D-1');
  const [lights, setLights] = useState(0);
  const [exhaustFan, setExhaustFan] = useState(0);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    source.listAccessibleRooms(session).then((rooms) => {
      if (cancelled) return;
      const byId = new Map<string, PropertyRef>();
      for (const r of rooms) byId.set(r.propertyId, { propertyId: r.propertyId, propertyName: r.propertyName });
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

  const activeName = useMemo(
    () => properties?.find((p) => p.propertyId === propertyId)?.propertyName ?? propertyId ?? '',
    [properties, propertyId],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!propertyId) return;
    setStatus('saving');
    try {
      const wattages: CircuitWattages = { lights, exhaustFan };
      await source.setTariffCategory(propertyId, category);
      await source.setCircuitWattages(propertyId, wattages);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  if (properties === null) {
    return <p className="p-8 text-sm text-ink-2">Loading…</p>;
  }
  if (properties.length === 0) {
    return (
      <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-8 text-center text-sm text-ink-2">
        No properties to manage yet.
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-6 sm:p-10">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Admin · Settings</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{activeName}</h1>
      <p className="mt-1 text-sm text-ink-2">
        Tariff category and controlled-circuit wattages drive the cost and savings figures.
      </p>

      <form onSubmit={handleSubmit} className="glass mt-6 flex flex-col gap-5 rounded-2xl p-6">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
          Tariff category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setStatus('idle');
            }}
            className="rounded-xl border border-hairline bg-white/70 px-3.5 py-2.5 font-normal text-ink outline-none focus:ring-2 focus:ring-brand"
          >
            {Object.keys(CEB_TARIFFS).map((key) => (
              <option key={key} value={key}>
                {CEB_TARIFFS[key].category}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
            Lights (W)
            <input
              type="number"
              min={0}
              value={lights}
              onChange={(e) => {
                setLights(Number(e.target.value));
                setStatus('idle');
              }}
              className="rounded-xl border border-hairline bg-white/70 px-3.5 py-2.5 font-normal text-ink outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
            Exhaust fan (W)
            <input
              type="number"
              min={0}
              value={exhaustFan}
              onChange={(e) => {
                setExhaustFan(Number(e.target.value));
                setStatus('idle');
              }}
              className="rounded-xl border border-hairline bg-white/70 px-3.5 py-2.5 font-normal text-ink outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'saving'}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
          {status === 'saved' && <span className="text-sm font-semibold text-brand-deep">Saved ✓</span>}
          {status === 'error' && (
            <span role="alert" className="text-sm font-semibold text-alarm">
              Couldn’t save — try again.
            </span>
          )}
        </div>
      </form>
    </main>
  );
}
