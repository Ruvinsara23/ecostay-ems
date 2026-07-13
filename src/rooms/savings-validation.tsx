'use client';

import { useEffect, useState } from 'react';
import { CEB_TARIFFS } from '@/tariff/ceb-tariffs';
import { monthToDateKWh } from '@/tariff/month-to-date';
import { computeValidation } from '@/tariff/validation';
import { Badge } from '@/ui/badge';
import type { CircuitWattages, DailyAggregateView } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';

/**
 * §10.2 validation, in the dashboard (owner dashboard v2): the pre/post
 * baseline-vs-EcoStay comparison and the ≥20% success indicator, modelled from
 * MEASURED occupancy (daily aggregates) + RATED circuit wattage. Demoable live;
 * the standalone scripts/validate-savings.ts prints the same figures.
 */
export function SavingsValidation({
  propertyId,
  roomId,
}: {
  propertyId: string;
  roomId: string;
}) {
  const source = useRoomDataSource();
  const [byDate, setByDate] = useState<Record<string, DailyAggregateView> | null>(null);
  const [wattages, setWattages] = useState<CircuitWattages | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  // Never call Date.now() during render (react-hooks/purity); tick it instead.
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () => source.subscribeDailyAggregates(propertyId, roomId, setByDate),
    [source, propertyId, roomId],
  );
  useEffect(
    () => source.subscribeCircuitWattages(propertyId, setWattages),
    [source, propertyId],
  );
  useEffect(
    () => source.subscribeTariffCategory(propertyId, setCategory),
    [source, propertyId],
  );

  const days = byDate ? Object.keys(byDate) : [];
  const occupiedMinutes = days.reduce((sum, d) => sum + (byDate?.[d]?.occupiedMinutes ?? 0), 0);
  const controlledWatts = wattages ? wattages.lights + wattages.exhaustFan : 0;
  const tariff = category ? CEB_TARIFFS[category] : undefined;

  const ready = byDate !== null && days.length > 0 && controlledWatts > 0;
  const result = ready
    ? computeValidation({
        windowHours: days.length * 24,
        occupiedHours: occupiedMinutes / 60,
        controlledWatts,
        tariff,
        // Gate #8: the CEB band comes from the month's total, not this window's kWh.
        monthToDateKWh: monthToDateKWh(byDate ?? {}, nowMs).total,
      })
    : null;

  return (
    <section className="glass rounded-[1.25rem] p-6 shadow-sm bg-white/60">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">Energy Savings Validation</h3>
          <p className="text-xs text-ink-3">Proposal §10.2 · target ≥ 20% reduction</p>
        </div>
        {result && (
          <Badge tone={result.passed ? 'success' : 'warn'}>
            {result.passed ? 'Target met' : 'Below target'}
          </Badge>
        )}
      </div>

      {!ready || !result ? (
        <p className="mt-4 text-sm text-ink-2">
          Not enough data yet — this needs at least one completed day of recorded occupancy
          {controlledWatts === 0 ? ' and the room’s controlled-circuit wattages set in Admin' : ''}.
          Daily figures are written by the nightly rollup.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-well/60 p-3">
              <p className="text-2xl font-bold text-ink [font-variant-numeric:tabular-nums]">
                {result.totalReductionPct}%
              </p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Energy reduction
              </p>
            </div>
            <div className="rounded-xl bg-well/60 p-3">
              <p className="text-2xl font-bold text-ink [font-variant-numeric:tabular-nums]">
                {result.avoidedKWh}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                kWh avoided
              </p>
            </div>
            <div className="rounded-xl bg-well/60 p-3">
              <p className="text-2xl font-bold text-ink [font-variant-numeric:tabular-nums]">
                {result.savedLKR === null ? '—' : `Rs ${result.savedLKR}`}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Saved
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <th className="py-1.5 font-semibold">Controlled circuits</th>
                  <th className="py-1.5 text-right font-semibold">Baseline</th>
                  <th className="py-1.5 text-right font-semibold">With EcoStay</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                <tr className="border-t border-hairline">
                  <td className="py-1.5 text-ink-2">Runtime</td>
                  <td className="py-1.5 text-right">{result.windowHours} h</td>
                  <td className="py-1.5 text-right">{result.occupiedHours} h</td>
                </tr>
                <tr className="border-t border-hairline">
                  <td className="py-1.5 text-ink-2">Energy</td>
                  <td className="py-1.5 text-right">{result.baselineKWh} kWh</td>
                  <td className="py-1.5 text-right">{result.automatedKWh} kWh</td>
                </tr>
                <tr className="border-t border-hairline">
                  <td className="py-1.5 text-ink-2">Unoccupied waste</td>
                  <td className="py-1.5 text-right">{result.avoidedKWh} kWh</td>
                  <td className="py-1.5 text-right">≈ 0 kWh</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
            Modelled over {result.vacantHours} vacant of {result.windowHours} h ({days.length} recorded
            day{days.length === 1 ? '' : 's'}) from measured occupancy and the rated wattages of the
            controlled circuits ({result.controlledWatts} W). Absolute energy is confirmed once the
            PZEM meter is wired.
          </p>
        </>
      )}
    </section>
  );
}
