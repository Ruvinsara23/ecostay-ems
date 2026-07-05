'use client';

import { useEffect, useMemo, useState } from 'react';
import { colomboDateKey } from '@/server/colombo-time';
import { CEB_TARIFFS } from '@/tariff/ceb-tariffs';
import { computeBill } from '@/tariff/compute-bill';
import { monthToDateKWh } from '@/tariff/month-to-date';
import type { DailyAggregateView, EnergyHistorySample } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';

const LKR = new Intl.NumberFormat('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DAY_MS = 86_400_000;

// Plot geometry (SVG user units)
const W = 560;
const H = 130;
const PLOT = { left: 34, right: 552, top: 12, bottom: 104 };

const BRAND = '#12a15e';
const BRAND_DEEP = '#0e8a4f';

function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 24 h power line — single series: the title names it, no legend (dataviz method). */
function PowerLine({ samples, sinceMs }: { samples: EnergyHistorySample[]; sinceMs: number }) {
  if (samples.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-2">
        No history yet — the sampler records every 5 minutes.
      </p>
    );
  }

  const yMax = Math.max(...samples.map((s) => s.power), 1) * 1.15;
  const x = (t: number) =>
    PLOT.left + ((t - sinceMs) / DAY_MS) * (PLOT.right - PLOT.left);
  const y = (p: number) => PLOT.bottom - (p / yMax) * (PLOT.bottom - PLOT.top);
  const points = samples.map((s) => `${x(s.sampledAt).toFixed(1)},${y(s.power).toFixed(1)}`);
  const last = samples[samples.length - 1];
  const area = `${points.join(' ')} ${x(last.sampledAt).toFixed(1)},${PLOT.bottom} ${x(
    samples[0].sampledAt,
  ).toFixed(1)},${PLOT.bottom}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Power over the last 24 hours"
      className="w-full"
    >
      <defs>
        <linearGradient id="ecostayArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BRAND} stopOpacity="0.22" />
          <stop offset="1" stopColor={BRAND} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={PLOT.left}
          x2={PLOT.right}
          y1={PLOT.bottom - f * (PLOT.bottom - PLOT.top)}
          y2={PLOT.bottom - f * (PLOT.bottom - PLOT.top)}
          stroke="rgba(27,28,28,0.08)"
          strokeWidth="1"
        />
      ))}
      <text x="2" y={PLOT.top + 4} fontSize="9" className="fill-ink-3">
        {yMax.toFixed(1)} W
      </text>
      <text x="2" y={PLOT.bottom + 2} fontSize="9" className="fill-ink-3">
        0
      </text>
      <polygon points={area} fill="url(#ecostayArea)" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={BRAND}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last.sampledAt)} cy={y(last.power)} r="3.5" fill={BRAND_DEEP} />
      {samples.map((s) => (
        <circle key={s.sampledAt} cx={x(s.sampledAt)} cy={y(s.power)} r="7" fill="transparent">
          <title>{`${s.power} W · ${timeLabel(s.sampledAt)}`}</title>
        </circle>
      ))}
      <text x={PLOT.left} y={H - 6} fontSize="9" className="fill-ink-3">
        {timeLabel(sinceMs)}
      </text>
      <text x={PLOT.right} y={H - 6} fontSize="9" textAnchor="end" className="fill-ink-3">
        now
      </text>
    </svg>
  );
}

/** 7-day kWh bars from nightly aggregates. Missing days are gaps, never zeros. */
function DailyBars({
  byDate,
  nowMs,
}: {
  byDate: Record<string, DailyAggregateView>;
  nowMs: number;
}) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dateKey = colomboDateKey(nowMs - (6 - i) * DAY_MS);
      return { dateKey, aggregate: byDate[dateKey] };
    });
  }, [byDate, nowMs]);

  if (days.every((d) => d.aggregate === undefined)) {
    return (
      <p className="py-4 text-center text-sm text-ink-2">
        No daily totals yet — the first rollup runs tonight.
      </p>
    );
  }

  const maxKWh = Math.max(...days.map((d) => d.aggregate?.kWhUsed ?? 0), 0.001);
  const BW = W / 7;

  return (
    <svg viewBox={`0 0 ${W} 96`} role="img" aria-label="Daily energy, last 7 days" className="w-full">
      <defs>
        <linearGradient id="ecostayBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BRAND} />
          <stop offset="1" stopColor={BRAND} stopOpacity="0.75" />
        </linearGradient>
      </defs>
      {days.map(({ dateKey, aggregate }, i) => {
        const cx = i * BW + BW / 2;
        const weekday = 'SMTWTFS'[new Date(dateKey).getUTCDay()];
        if (aggregate === undefined) {
          return (
            <g key={dateKey}>
              <line
                data-gap
                x1={cx - 10}
                x2={cx + 10}
                y1={72}
                y2={72}
                stroke="rgba(27,28,28,0.10)"
                strokeWidth="2"
              />
              <text x={cx} y={88} fontSize="9" textAnchor="middle" className="fill-ink-3">
                {weekday}
              </text>
            </g>
          );
        }
        const height = Math.max(3, (aggregate.kWhUsed / maxKWh) * 58);
        const isMax = aggregate.kWhUsed === maxKWh;
        return (
          <g key={dateKey}>
            {isMax && (
              <text x={cx} y={72 - height - 4} fontSize="9" textAnchor="middle" className="fill-ink-2">
                {aggregate.kWhUsed.toFixed(2)}
              </text>
            )}
            <rect
              data-bar
              x={cx - 12}
              y={72 - height}
              width="24"
              height={height}
              rx="4"
              fill="url(#ecostayBar)"
            >
              <title>{`${dateKey}: ${aggregate.kWhUsed.toFixed(3)} kWh, occupied ${aggregate.occupiedMinutes} min`}</title>
            </rect>
            <text x={cx} y={88} fontSize="9" textAnchor="middle" className="fill-ink-3">
              {weekday}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function EnergyHistorySection({
  propertyId,
  roomId,
}: {
  propertyId: string;
  roomId: string;
}) {
  const source = useRoomDataSource();
  const [nowMs] = useState(() => Date.now()); // captured once at mount
  const sinceMs = nowMs - DAY_MS;
  const [samples, setSamples] = useState<EnergyHistorySample[]>([]);
  const [byDate, setByDate] = useState<Record<string, DailyAggregateView>>({});
  const [tariffCategory, setTariffCategory] = useState<string | null>(null);

  useEffect(() => {
    return source.subscribeEnergyHistory(propertyId, roomId, sinceMs, setSamples);
  }, [source, propertyId, roomId, sinceMs]);

  useEffect(() => {
    return source.subscribeDailyAggregates(propertyId, roomId, setByDate);
  }, [source, propertyId, roomId]);

  useEffect(() => {
    return source.subscribeTariffCategory(propertyId, setTariffCategory);
  }, [source, propertyId]);

  // Monthly bill — CEB tariffs are monthly, so run month-to-date kWh through the tariff.
  const mtdKWh = monthToDateKWh(byDate, nowMs);
  const tariff = tariffCategory ? CEB_TARIFFS[tariffCategory] : undefined;
  const bill = tariff ? computeBill(tariff, mtdKWh) : null;

  return (
    <section aria-label="Energy history" className="glass rounded-2xl p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        Energy history
        <span className="rounded-md bg-warnbrand-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-warnbrand">
          Simulated
        </span>
      </h3>
      <PowerLine samples={samples} sinceMs={sinceMs} />
      <div className="mt-2 border-t border-hairline pt-2">
        <DailyBars byDate={byDate} nowMs={nowMs} />
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t border-hairline pt-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Estimated bill this month
          </p>
          {bill ? (
            <p className="text-[11px] text-ink-3">
              {tariff?.category} · {mtdKWh.toFixed(2)} kWh so far
            </p>
          ) : (
            <p className="text-[11px] text-ink-3">Set a tariff to estimate cost</p>
          )}
        </div>
        {bill && (
          <p className="text-lg font-bold text-ink [font-variant-numeric:tabular-nums]">
            LKR {LKR.format(bill.totalLKR)}
          </p>
        )}
      </div>
    </section>
  );
}
