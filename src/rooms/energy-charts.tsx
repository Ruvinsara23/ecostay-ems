'use client';

import { useEffect, useMemo, useState } from 'react';
import { colomboDateKey } from '@/server/colombo-time';
import type { DailyAggregateView, EnergyHistorySample } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';

const DAY_MS = 86_400_000;

// Plot geometry (SVG user units)
const W = 560;
const H = 130;
const PLOT = { left: 34, right: 552, top: 12, bottom: 104 };

function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 24 h power line — single series: the title names it, no legend (dataviz method). */
function PowerLine({ samples, sinceMs }: { samples: EnergyHistorySample[]; sinceMs: number }) {
  if (samples.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">
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
      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={PLOT.left}
          x2={PLOT.right}
          y1={PLOT.bottom - f * (PLOT.bottom - PLOT.top)}
          y2={PLOT.bottom - f * (PLOT.bottom - PLOT.top)}
          stroke="currentColor"
          className="text-zinc-200 dark:text-zinc-800"
          strokeWidth="1"
        />
      ))}
      <text x="2" y={PLOT.top + 4} fontSize="9" className="fill-zinc-400">
        {yMax.toFixed(1)} W
      </text>
      <text x="2" y={PLOT.bottom + 2} fontSize="9" className="fill-zinc-400">
        0
      </text>
      <polygon points={area} className="fill-zinc-900/10 dark:fill-zinc-100/10" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-zinc-900 dark:text-zinc-100"
      />
      <circle
        cx={x(last.sampledAt)}
        cy={y(last.power)}
        r="3.5"
        className="fill-zinc-900 dark:fill-zinc-100"
      />
      {samples.map((s) => (
        <circle key={s.sampledAt} cx={x(s.sampledAt)} cy={y(s.power)} r="7" fill="transparent">
          <title>{`${s.power} W · ${timeLabel(s.sampledAt)}`}</title>
        </circle>
      ))}
      <text x={PLOT.left} y={H - 6} fontSize="9" className="fill-zinc-400">
        {timeLabel(sinceMs)}
      </text>
      <text x={PLOT.right} y={H - 6} fontSize="9" textAnchor="end" className="fill-zinc-400">
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
      <p className="py-4 text-center text-sm text-zinc-500">
        No daily totals yet — the first rollup runs tonight.
      </p>
    );
  }

  const maxKWh = Math.max(...days.map((d) => d.aggregate?.kWhUsed ?? 0), 0.001);
  const BW = W / 7;

  return (
    <svg viewBox={`0 0 ${W} 96`} role="img" aria-label="Daily energy, last 7 days" className="w-full">
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
                stroke="currentColor"
                strokeWidth="2"
                className="text-zinc-200 dark:text-zinc-800"
              />
              <text x={cx} y={88} fontSize="9" textAnchor="middle" className="fill-zinc-400">
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
              <text x={cx} y={72 - height - 4} fontSize="9" textAnchor="middle" className="fill-zinc-500">
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
              className="fill-zinc-900 dark:fill-zinc-100"
            >
              <title>{`${dateKey}: ${aggregate.kWhUsed.toFixed(3)} kWh, occupied ${aggregate.occupiedMinutes} min`}</title>
            </rect>
            <text x={cx} y={88} fontSize="9" textAnchor="middle" className="fill-zinc-400">
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

  useEffect(() => {
    return source.subscribeEnergyHistory(propertyId, roomId, sinceMs, setSamples);
  }, [source, propertyId, roomId, sinceMs]);

  useEffect(() => {
    return source.subscribeDailyAggregates(propertyId, roomId, setByDate);
  }, [source, propertyId, roomId]);

  return (
    <section
      aria-label="Energy history"
      className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Energy history
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          Simulated
        </span>
      </h3>
      <PowerLine samples={samples} sinceMs={sinceMs} />
      <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-900">
        <DailyBars byDate={byDate} nowMs={nowMs} />
      </div>
    </section>
  );
}
