'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import type { DeviceCommands } from '@/telemetry/contract';
import type { RoomLatest } from './room-data-source';
import { deriveRoomSceneState } from './room-scene-state';
import type { SceneDeviceKey } from './room-scene-3d';

const RoomScene3D = dynamic(
  () => import('./room-scene-3d').then((module) => module.RoomScene3D),
  { ssr: false },
);

type SensorKey = 'door' | 'pir' | 'dht' | 'gas' | 'water';

const MARKERS: Array<{
  key: SensorKey;
  letter: string;
  label: string;
  x: number;
  y: number;
}> = [
  // Kept in the open centre of the room so none sit under the floating cards.
  { key: 'door', letter: 'D', label: 'Door sensor readings', x: 215, y: 205 },
  { key: 'pir', letter: 'M', label: 'Motion sensor readings', x: 330, y: 110 },
  { key: 'dht', letter: 'T', label: 'Climate sensor readings', x: 430, y: 165 },
  { key: 'gas', letter: 'G', label: 'Gas sensor readings', x: 360, y: 255 },
  { key: 'water', letter: 'W', label: 'Water sensor readings', x: 255, y: 150 },
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
function RoomSceneFallback({ latest, online }: { latest: RoomLatest; online: boolean }) {
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
                const selected = openSensor === marker.key;
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
                    <circle r="24" fill="transparent" />
                    {selected && (
                      <circle r="22" fill="none" stroke="#7c3aed" strokeWidth="2" opacity="0.5" />
                    )}
                    <circle
                      r="16"
                      fill={selected ? '#7c3aed' : 'rgba(255,255,255,0.98)'}
                      stroke={
                        alarm ? '#d6453d' : selected || active ? '#7c3aed' : 'rgba(28,26,39,0.25)'
                      }
                      strokeWidth={alarm || selected || active ? 3.5 : 2}
                    />
                    <text x="0" y="4" textAnchor="middle" fill={selected ? '#ffffff' : '#1c1a27'}>
                      {marker.letter}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Reading popover — anchored to the selected letter */}
          {openSensor &&
            (() => {
              const m = MARKERS.find((mk) => mk.key === openSensor);
              if (!m) return null;
              const leftPct = ((m.x - 34) / 574) * 100;
              const topPct = ((m.y + 10) / 400) * 100;
              const below = topPct < 30; // top markers open downward so they don't clip
              return (
                <div
                  role="status"
                  style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  className={`glass-strong pointer-events-none absolute z-50 min-w-[168px] -translate-x-1/2 rounded-2xl px-4 py-3 text-xs shadow-2xl ${
                    below ? 'translate-y-8' : '-translate-y-[calc(100%+2rem)]'
                  }`}
                >
                  <b className="mb-1.5 block text-[13px] font-bold text-ink">
                    {SENSOR_TITLES[openSensor]}
                  </b>
                  {sensorRows(openSensor, latest).map(([label, value]) => (
                    <div key={label} className="mt-1 flex justify-between gap-5">
                      <span className="font-medium text-ink-3">{label}</span>
                      <b className="text-brand [font-variant-numeric:tabular-nums]">{value}</b>
                    </div>
                  ))}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function browserSupportsWebGL(): boolean {
  if (
    typeof window === 'undefined' ||
    (typeof window.WebGLRenderingContext === 'undefined' &&
      typeof window.WebGL2RenderingContext === 'undefined')
  ) {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const DEVICE_SCENE_LABELS: Record<SceneDeviceKey, string> = {
  lights: 'Lights',
  exhaustFan: 'Fan',
  airConditioner: 'Air conditioner',
  waterPump: 'Pump',
};

const DEVICE_SCENE_SHORT_LABELS: Record<SceneDeviceKey, string> = {
  ...DEVICE_SCENE_LABELS,
  airConditioner: 'AC',
};

/**
 * Full WebGL digital twin with a 2.5D fallback for browsers without WebGL.
 * Device visuals are commanded state (the firmware has no lamp/fan/AC/pump ack);
 * clicking a 3D object delegates to the parent, which owns confirmation/writes.
 */
export function RoomScene({
  latest,
  online,
  commands = {},
  controlsEnabled = false,
  pendingDevice,
  onDeviceClick,
}: {
  latest: RoomLatest;
  online: boolean;
  commands?: DeviceCommands;
  controlsEnabled?: boolean;
  pendingDevice?: SceneDeviceKey;
  onDeviceClick?: (key: SceneDeviceKey) => void;
}) {
  const [webglAvailable, setWebglAvailable] = useState(false);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const sceneState = deriveRoomSceneState(latest, commands, online);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    const frame = window.requestAnimationFrame(() => {
      setWebglAvailable(browserSupportsWebGL());
      if (query) update();
    });
    query?.addEventListener?.('change', update);
    return () => {
      window.cancelAnimationFrame(frame);
      query?.removeEventListener?.('change', update);
    };
  }, []);

  const disabled = !controlsEnabled || !online || pendingDevice !== undefined;
  const webglActive = webglAvailable && !rendererFailed;

  return (
    <div
      className={`relative aspect-[5/4] w-full max-w-[980px] overflow-hidden rounded-[2rem] shadow-2xl ${
        online ? '' : 'grayscale'
      }`}
      data-renderer={webglActive ? 'webgl' : 'fallback'}
      data-scene-stale={online ? undefined : 'true'}
    >
      <div
        aria-hidden={webglActive || undefined}
        className={`absolute inset-0 grid place-items-center bg-canvas ${
          webglActive ? 'pointer-events-none' : ''
        }`}
      >
        <RoomSceneFallback latest={latest} online={online} />
      </div>

      {webglActive && (
        <div className={`absolute inset-0 ${online ? '' : 'opacity-55'}`}>
          <SceneErrorBoundary fallback={null} onError={() => setRendererFailed(true)}>
            <RoomScene3D
              state={sceneState}
              reducedMotion={reducedMotion}
              controlsDisabled={disabled}
              pendingDevice={pendingDevice}
              onDeviceClick={(key) => onDeviceClick?.(key)}
            />
          </SceneErrorBoundary>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-wrap gap-2">
        <span className="rounded-full bg-ink/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white shadow">
          Live sensors · commanded devices
        </span>
        {webglActive && (
          <span className="rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold text-ink-2 shadow">
            Drag to orbit · Scroll to zoom · Select a device
          </span>
        )}
      </div>

      {onDeviceClick && (
        <div
          aria-label="3D room device controls"
          className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap justify-center gap-2 rounded-2xl bg-white/90 p-2 shadow-xl backdrop-blur"
        >
          {(Object.keys(DEVICE_SCENE_LABELS) as SceneDeviceKey[]).map((key) => {
            const visualOn = {
              lights: sceneState.lightsOn,
              exhaustFan: sceneState.fanOn,
              airConditioner: sceneState.acOn,
              waterPump: sceneState.pumpOn,
            }[key];
            const commandedOn = commands[key] === true;
            const gasForced = key === 'exhaustFan' && sceneState.fanForcedByGas;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled || gasForced}
                onClick={() => onDeviceClick(key)}
                aria-label={
                  gasForced
                    ? 'Exhaust fan forced on by gas alarm'
                    : `${commandedOn ? 'Turn off' : 'Turn on'} ${DEVICE_SCENE_LABELS[key]} from 3D room`
                }
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  visualOn ? 'bg-brand text-white' : 'bg-well text-ink-2 hover:bg-brand-soft'
                }`}
              >
                {DEVICE_SCENE_SHORT_LABELS[key]}{' '}
                <span className="font-semibold opacity-80">
                  {pendingDevice === key
                    ? 'Saving…'
                    : gasForced
                      ? 'Forced'
                      : commandedOn
                        ? 'Cmd On'
                        : 'Cmd Off'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!online && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-30 mx-auto w-fit rounded-full bg-ink/85 px-4 py-2 text-xs font-bold text-white shadow">
          Scene frozen · device offline
        </div>
      )}
    </div>
  );
}
