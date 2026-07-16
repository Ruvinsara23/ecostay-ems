'use client';

import { useId } from 'react';

/**
 * Dependency-free SVG gauges for bounded sensor readings, matching the lavender
 * glass theme. Two shapes:
 *   - TankGauge: a vertical fill (water level, 0–100 %), with a low-water marker.
 *   - ArcGauge:  a 180° dial (gas, temperature, …) with a threshold tick.
 *
 * Convention (follows energy-charts.tsx / room-scene.tsx): SVG geometry uses
 * hard-coded theme hex, not Tailwind classes. Every value may be `undefined`
 * at runtime (RTDB fields are partial) — a missing value renders a muted,
 * empty state, never 0 or NaN. Gradient/clip ids are per-instance (useId) —
 * a shared id makes every gauge on the page reuse the first one's fill.
 */

const BRAND = '#7c3aed';
const BRAND_DEEP = '#5b21b6';
const ALARM = '#d6453d';
const TRACK = 'rgba(28,26,39,0.10)';
const INK3 = '#9e9ba8';

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** A vertical tank whose fill height is `level` % of full. Low fill turns red. */
export function TankGauge({
  level,
  lowThreshold = 20,
}: {
  level: number | undefined;
  lowThreshold?: number;
}) {
  const uid = useId();
  const fillId = `tankFill-${uid}`;
  const clipId = `tankClip-${uid}`;
  const known = typeof level === 'number';
  const pct = known ? clamp01(level! / 100) : 0;
  const low = known && level! <= lowThreshold;

  // Tank body geometry (viewBox 100 × 130).
  const bx = 26;
  const by = 8;
  const bw = 48;
  const bh = 112;
  const fillH = bh * pct;
  const fillY = by + bh - fillH;
  const lowY = by + bh - bh * clamp01(lowThreshold / 100);

  return (
    <svg viewBox="0 0 100 130" className="w-full" role="img" aria-label={known ? `Tank level ${level}%` : 'Tank level unknown'}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={low ? ALARM : BRAND} stopOpacity="0.9" />
          <stop offset="1" stopColor={low ? ALARM : BRAND_DEEP} stopOpacity="0.95" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x={bx} y={by} width={bw} height={bh} rx="12" />
        </clipPath>
      </defs>

      {/* Track */}
      <rect x={bx} y={by} width={bw} height={bh} rx="12" fill={TRACK} />

      {/* Water fill */}
      {known && pct > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <rect x={bx} y={fillY} width={bw} height={fillH} fill={`url(#${fillId})`} />
          {/* subtle surface line */}
          <rect x={bx} y={fillY} width={bw} height="2" fill="#ffffff" opacity="0.35" />
        </g>
      )}

      {/* Low-water threshold marker */}
      <line
        x1={bx}
        y1={lowY}
        x2={bx + bw}
        y2={lowY}
        stroke={ALARM}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.55"
        clipPath={`url(#${clipId})`}
      />

      {/* Tank outline */}
      <rect x={bx} y={by} width={bw} height={bh} rx="12" fill="none" stroke="rgba(28,26,39,0.16)" strokeWidth="1.5" />

      {/* Scale ticks */}
      <text x={bx + bw + 6} y={by + 4} fontSize="9" fill={INK3}>100%</text>
      <text x={bx + bw + 6} y={by + bh / 2 + 3} fontSize="9" fill={INK3}>50%</text>
      <text x={bx + bw + 6} y={by + bh} fontSize="9" fill={INK3}>0%</text>

      {/* Empty / low warning glyph */}
      {(low || !known) && (
        <g transform="translate(50, 64)">
          <circle r="16" fill={known ? 'rgba(214,69,61,0.12)' : 'rgba(28,26,39,0.06)'} />
          {known ? (
            <>
              <path d="M0 -8 L8 6 L-8 6 Z" fill="none" stroke={ALARM} strokeWidth="1.8" strokeLinejoin="round" />
              <line x1="0" y1="-2" x2="0" y2="2" stroke={ALARM} strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="0" cy="4" r="0.9" fill={ALARM} />
            </>
          ) : (
            <text x="0" y="4" fontSize="14" fill={INK3} textAnchor="middle" fontWeight="700">?</text>
          )}
        </g>
      )}
    </svg>
  );
}

/** A 180° dial from `min`→`max`. Value arc turns red past `threshold`. */
export function ArcGauge({
  value,
  min = 0,
  max,
  unit,
  threshold,
  thresholdDirection = 'above',
  warnColor = ALARM,
}: {
  value: number | undefined;
  min?: number;
  max: number;
  unit: string;
  threshold?: number;
  thresholdDirection?: 'above' | 'below';
  warnColor?: string;
}) {
  const known = typeof value === 'number';
  const frac = known ? clamp01((value! - min) / (max - min)) : 0;
  const past =
    known && threshold !== undefined
      ? thresholdDirection === 'above'
        ? value! > threshold
        : value! < threshold
      : false;
  const arcColor = past ? warnColor : BRAND;

  // Semicircle over the top: center (60,60) r=50, from (10,60) to (110,60).
  const cx = 60;
  const cy = 60;
  const r = 50;
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  // Threshold tick point on the arc.
  let tick: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (threshold !== undefined) {
    const tf = clamp01((threshold - min) / (max - min));
    const theta = (1 - tf) * Math.PI; // radians; t=0 → π (left), t=1 → 0 (right)
    tick = {
      x1: cx + (r - 8) * Math.cos(theta),
      y1: cy - (r - 8) * Math.sin(theta),
      x2: cx + (r + 3) * Math.cos(theta),
      y2: cy - (r + 3) * Math.sin(theta),
    };
  }

  return (
    <svg viewBox="0 0 120 78" className="w-full" role="img" aria-label={known ? `${value} ${unit}` : `${unit} unknown`}>
      {/* Track */}
      <path d={arcPath} pathLength={100} fill="none" stroke={TRACK} strokeWidth="9" strokeLinecap="round" />
      {/* Value */}
      {known && frac > 0 && (
        <path
          d={arcPath}
          pathLength={100}
          fill="none"
          stroke={arcColor}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${frac * 100} 100`}
        />
      )}
      {/* Threshold tick */}
      {tick && (
        <line x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke="rgba(28,26,39,0.45)" strokeWidth="1.5" strokeLinecap="round" />
      )}
      {/* Centre readout */}
      <text x={cx} y="54" textAnchor="middle" fontSize="20" fontWeight="700" fill={past ? warnColor : '#1c1a27'} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {known ? value : '—'}
      </text>
      <text x={cx} y="70" textAnchor="middle" fontSize="10" fontWeight="600" fill={INK3}>
        {unit}
      </text>
    </svg>
  );
}
