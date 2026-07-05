'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomLatest } from './room-data-source';

type SensorKey = 'door' | 'pir' | 'dht' | 'gas' | 'water';

const MARKERS: Array<{
  key: SensorKey;
  letter: string;
  label: string;
  x: number;
  y: number;
}> = [
  { key: 'door', letter: 'D', label: 'Door sensor readings', x: 150, y: 150 },
  { key: 'pir', letter: 'M', label: 'Motion sensor readings', x: 320, y: 12 },
  { key: 'dht', letter: 'T', label: 'Climate sensor readings', x: 560, y: 150 },
  { key: 'gas', letter: 'G', label: 'Gas sensor readings', x: 470, y: 300 },
  { key: 'water', letter: 'W', label: 'Water sensor readings', x: 180, y: 320 },
];

function reading(value: number | undefined, unit: string): string {
  return value === undefined ? '—' : `${value} ${unit}`;
}

function sensorRows(key: SensorKey, latest: RoomLatest): Array<[string, string]> {
  switch (key) {
    case 'door':
      return [['State', latest.doorOpen === undefined ? '—' : latest.doorOpen ? 'Open' : 'Closed']];
    case 'pir':
      return [
        ['Motion', latest.motionDetected ? 'Detected' : 'None'],
        ['Presence', latest.humanPresent ? 'Present' : 'Away'],
      ];
    case 'dht':
      return [
        ['Temperature', reading(latest.temperature, '°C')],
        ['Humidity', reading(latest.humidity, '%')],
      ];
    case 'gas':
      return [
        ['Level', reading(latest.gas, 'ppm')],
        ['Alarm above', '300 ppm'],
      ];
    case 'water':
      return [
        ['Tank', reading(latest.waterLevel, '%')],
        ['Flow', reading(latest.flowRate, 'L/min')],
      ];
  }
}

const SENSOR_TITLES: Record<SensorKey, string> = {
  door: 'Door reed',
  pir: 'Motion (PIR)',
  dht: 'Climate (DHT11)',
  gas: 'Gas (MQ)',
  water: 'Water',
};

/**
 * The 2.5D isometric room (issue 05): greyscale geometry, brand-green life.
 * Interactive — pointer-tilt parallax (reduced-motion aware) and tappable
 * sensor markers with live-reading tooltips.
 */
export function RoomScene({ latest, online }: { latest: RoomLatest; online: boolean }) {
  const [openSensor, setOpenSensor] = useState<SensorKey | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest('[data-sensor]')) setOpenSensor(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const doorOpen = latest.doorOpen === true;
  const present = latest.humanPresent === true;
  const gasAlarm = latest.gas !== undefined && latest.gas > 300;
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      ref={wrapRef}
      className="relative grid place-items-center"
      {...(online ? {} : { 'data-scene-stale': 'true' })}
      onPointerMove={(event) => {
        if (reducedMotion || !wrapRef.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        setTilt({
          x: (event.clientX - rect.left) / rect.width - 0.5,
          y: (event.clientY - rect.top) / rect.height - 0.5,
        });
      }}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div
        className={`w-full transition-[transform,opacity,filter] duration-300 ${
          online ? '' : 'opacity-45 grayscale'
        }`}
        style={{
          transform: `perspective(900px) rotateX(${(-tilt.y * 7).toFixed(2)}deg) rotateY(${(
            tilt.x * 9
          ).toFixed(2)}deg)`,
        }}
      >
        <div 
          className="relative w-full max-w-[900px] aspect-square mx-auto overflow-visible"
          data-glow={present ? 'on' : 'off'}
          data-door={doorOpen ? 'open' : 'closed'}
        >
          {/* 3D background image */}
          <img 
            src="/3d-model.png" 
            alt="3D Office Layout" 
            className="absolute inset-0 w-full h-full object-cover rounded-[2rem] shadow-2xl mix-blend-multiply opacity-90"
          />
          {/* Overlay for sensor markers */}
          <svg
            viewBox="34 -10 574 400"
            role="img"
            aria-label="Interactive sensor overlay"
            className="absolute inset-0 w-full h-full z-10 drop-shadow-xl"
          >
            {/* sensor markers: letter chips, tap for readings */}
            <g fontFamily="inherit" fontWeight="700" fontSize="11">
              {MARKERS.map((marker) => {
                const active =
                  (marker.key === 'pir' && latest.motionDetected === true) ||
                  (marker.key === 'door' && doorOpen);
                const alarm = marker.key === 'gas' && gasAlarm;
                return (
                  <g
                    key={marker.key}
                    role="button"
                    tabIndex={0}
                    aria-label={marker.label}
                    data-sensor={marker.key}
                    {...(alarm ? { 'data-gas-alarm': 'true' } : {})}
                    transform={`translate(${marker.x},${marker.y})`}
                    className="cursor-pointer outline-none transition-transform hover:scale-110"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenSensor(openSensor === marker.key ? null : marker.key);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setOpenSensor(openSensor === marker.key ? null : marker.key);
                      }
                    }}
                  >
                    <circle r="22" fill="transparent" />
                    <circle
                      r="16"
                      fill="rgba(255,255,255,0.95)"
                      stroke={alarm ? '#d6453d' : active ? '#7c3aed' : 'rgba(28,26,39,0.15)'}
                      strokeWidth={alarm || active ? 4 : 2}
                    />
                    <text x="0" y="4" textAnchor="middle" fill="#1c1a27">
                      {marker.letter}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {openSensor && (
        <div
          role="status"
          className="glass-strong pointer-events-none absolute left-1/2 top-[-40px] z-50 min-w-[180px] -translate-x-1/2 rounded-2xl px-4 py-3 text-xs text-ink-2 shadow-2xl"
        >
          <b className="mb-1.5 block text-[13px] font-bold text-ink">{SENSOR_TITLES[openSensor]}</b>
          {sensorRows(openSensor, latest).map(([label, value]) => (
            <div key={label} className="mt-1 flex justify-between gap-5">
              <span className="font-medium text-ink-3">{label}</span>
              <b className="text-brand [font-variant-numeric:tabular-nums]">{value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
