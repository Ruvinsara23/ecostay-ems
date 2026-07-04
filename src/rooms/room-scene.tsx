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
        <svg
          viewBox="34 -10 574 400"
          role="img"
          aria-label="Isometric view of the room"
          className="mx-auto block w-full max-w-[720px]"
        >
          <defs>
            <linearGradient id="sceneFloor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="1" stopColor="#eef4f0" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="sceneWallL" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#12a15e" stopOpacity="0.10" />
              <stop offset="1" stopColor="#12a15e" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="sceneWallR" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0" stopColor="#0e8a4f" stopOpacity="0.16" />
              <stop offset="1" stopColor="#0e8a4f" stopOpacity="0.04" />
            </linearGradient>
            <radialGradient id="sceneGlow">
              <stop offset="0" stopColor="#12a15e" stopOpacity={present ? 0.42 : 0.1} />
              <stop offset="1" stopColor="#12a15e" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* floor */}
          <polygon
            points="320,88 596,232 320,376 44,232"
            fill="url(#sceneFloor)"
            stroke="rgba(27,28,28,0.12)"
            strokeWidth="2"
          />
          {/* occupancy glow */}
          <ellipse
            data-glow={present ? 'on' : 'off'}
            cx="320"
            cy="238"
            rx="168"
            ry="82"
            fill="url(#sceneGlow)"
          />
          {/* glass walls (tinted) */}
          <polygon
            points="44,232 320,88 320,20 44,164"
            fill="url(#sceneWallL)"
            stroke="rgba(18,161,94,0.28)"
            strokeWidth="2"
          />
          <polygon
            points="320,88 596,232 596,164 320,20"
            fill="url(#sceneWallR)"
            stroke="rgba(18,161,94,0.34)"
            strokeWidth="2"
          />
          <line x1="412" y1="68" x2="412" y2="136" stroke="rgba(18,161,94,0.22)" strokeWidth="2" />
          <line x1="504" y1="116" x2="504" y2="184" stroke="rgba(18,161,94,0.22)" strokeWidth="2" />

          {/* bed */}
          <g>
            <polygon points="152,238 264,180 336,216 224,274" fill="#d7d9d6" />
            <polygon points="152,238 224,274 224,296 152,260" fill="#bcbfbc" />
            <polygon points="224,274 336,216 336,238 224,296" fill="#cacdc9" />
            <polygon
              points="170,232 234,199 276,220 212,253"
              fill="#ffffff"
              stroke="rgba(27,28,28,0.10)"
            />
          </g>
          {/* side table */}
          <g>
            <polygon points="356,262 392,244 416,256 380,274" fill="#d7d9d6" />
            <polygon points="356,262 380,274 380,290 356,278" fill="#bcbfbc" />
            <polygon points="380,274 416,256 416,272 380,290" fill="#cacdc9" />
          </g>

          {/* door — swings on doorOpen */}
          <g
            data-door={doorOpen ? 'open' : 'closed'}
            style={{
              transformOrigin: '150px 236px',
              transformBox: 'view-box',
              transform: `rotate(${doorOpen ? -38 : 0}deg)`,
              transition: reducedMotion ? undefined : 'transform 0.35s',
            }}
          >
            <polygon points="150,168 150,236 196,260 196,192" fill="#7d817e" opacity="0.85" />
          </g>

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
                  className="cursor-pointer outline-none"
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
                    r="14"
                    fill="rgba(255,255,255,0.92)"
                    stroke={alarm ? '#d6453d' : active ? '#12a15e' : 'rgba(27,28,28,0.12)'}
                    strokeWidth={alarm || active ? 3 : 2}
                  />
                  <text x="0" y="4" textAnchor="middle" fill="#1b1c1c">
                    {marker.letter}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {openSensor && (
        <div
          role="status"
          className="glass-strong pointer-events-none absolute left-1/2 top-3 z-10 min-w-[160px] -translate-x-1/2 rounded-xl px-3.5 py-2.5 text-xs text-ink-2"
        >
          <b className="mb-1 block text-[12.5px] text-ink">{SENSOR_TITLES[openSensor]}</b>
          {sensorRows(openSensor, latest).map(([label, value]) => (
            <div key={label} className="mt-0.5 flex justify-between gap-4">
              <span>{label}</span>
              <b className="text-ink [font-variant-numeric:tabular-nums]">{value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
