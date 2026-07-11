'use client';

import { useEffect, useMemo, useState } from 'react';
import { OCCUPANCY_STATES, type OccupancyState } from '@/telemetry/contract';
import { deviceFreshness } from '@/telemetry/device-freshness';
import { isOccupied } from '@/telemetry/is-occupied';
import { Badge } from '@/ui/badge';
import type { AlertView, RoomLatest, RoomRef } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';

const keyOf = (propertyId: string, roomId: string) => `${propertyId}/${roomId}`;

function ageLabel(ageSeconds: number | null): string {
  if (ageSeconds === null) return 'unknown';
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
  return `${Math.floor(ageSeconds / 3600)}h ago`;
}

type RoomStatus = {
  reported: boolean;
  online: boolean;
  ageSeconds: number | null;
  occupancy: 'Occupied' | 'Vacant' | '—';
  temperature?: number;
  power?: number;
  openAlerts: number;
  hasCritical: boolean;
};

function Tile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="glass rounded-2xl p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold ${danger ? 'text-alarm' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}

/**
 * Owner landing (owner dashboard v2): the property→room hierarchy an owner with
 * several properties actually needs. Live status per room — the SAME 15 s
 * freshness the room view shows, plus open alerts from the alert feed — so the
 * owner sees at a glance what needs attention before drilling into a room.
 */
export function OwnerHome({
  rooms,
  onOpenRoom,
}: {
  rooms: RoomRef[];
  onOpenRoom: (room: RoomRef) => void;
}) {
  const source = useRoomDataSource();
  const [latestByRoom, setLatestByRoom] = useState<Record<string, RoomLatest | null>>({});
  const [alertsByProperty, setAlertsByProperty] = useState<Record<string, AlertView[]>>({});
  const [offsetMs, setOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const propertyIds = useMemo(() => [...new Set(rooms.map((r) => r.propertyId))], [rooms]);

  useEffect(() => source.subscribeServerTimeOffset(setOffsetMs), [source]);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const room of rooms) {
      const k = keyOf(room.propertyId, room.roomId);
      unsubs.push(
        source.subscribeLatest(
          room.propertyId,
          room.roomId,
          (latest) => setLatestByRoom((prev) => ({ ...prev, [k]: latest })),
          () => setLatestByRoom((prev) => ({ ...prev, [k]: prev[k] ?? null })),
        ),
      );
    }
    for (const pid of propertyIds) {
      unsubs.push(
        source.subscribeAlerts(pid, (alerts) =>
          setAlertsByProperty((prev) => ({ ...prev, [pid]: alerts })),
        ),
      );
    }
    return () => unsubs.forEach((unsub) => unsub());
  }, [source, rooms, propertyIds]);

  const now = nowMs + offsetMs;

  function statusFor(room: RoomRef): RoomStatus {
    const latest = latestByRoom[keyOf(room.propertyId, room.roomId)] ?? null;
    const fresh = deviceFreshness(latest?.updatedAt, now);
    const known =
      latest && OCCUPANCY_STATES.includes(latest.occupancyState as OccupancyState)
        ? (latest.occupancyState as OccupancyState)
        : undefined;
    const open = (alertsByProperty[room.propertyId] ?? []).filter(
      (alert) => alert.roomId === room.roomId && alert.resolvedAt === undefined,
    );
    return {
      reported: latest !== null,
      online: fresh.online,
      ageSeconds: fresh.ageSeconds,
      occupancy: known === undefined ? '—' : isOccupied(known) ? 'Occupied' : 'Vacant',
      temperature: latest?.temperature,
      power: latest?.power,
      openAlerts: open.length,
      hasCritical: open.some((alert) => alert.severity === 'critical'),
    };
  }

  const statuses = rooms.map(statusFor);
  const onlineCount = statuses.filter((s) => s.online).length;
  const alertCount = statuses.reduce((n, s) => n + s.openAlerts, 0);

  const byProperty = new Map<string, RoomRef[]>();
  for (const room of rooms) {
    const list = byProperty.get(room.propertyId) ?? [];
    list.push(room);
    byProperty.set(room.propertyId, list);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Properties" value={String(propertyIds.length)} />
        <Tile label="Rooms" value={String(rooms.length)} />
        <Tile label="Rooms reporting" value={`${onlineCount}/${rooms.length}`} />
        <Tile label="Open alerts" value={String(alertCount)} danger={alertCount > 0} />
      </dl>

      <div className="mt-8 flex flex-col gap-8">
        {[...byProperty.entries()].map(([propertyId, list]) => (
          <section key={propertyId}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-ink">
                  {list[0].propertyName ?? propertyId}
                </h2>
                {list[0].propertyName && (
                  <p className="truncate text-xs text-ink-3">{propertyId}</p>
                )}
              </div>
              <span className="flex-none text-xs font-medium text-ink-2">
                {list.length} room{list.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((room) => {
                const s = statusFor(room);
                return (
                  <button
                    key={keyOf(room.propertyId, room.roomId)}
                    type="button"
                    onClick={() => onOpenRoom(room)}
                    className="glass rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 flex-none rounded-full ${s.online ? 'bg-success' : 'bg-ink-3/40'}`}
                            aria-hidden
                          />
                          <span className="truncate font-bold text-ink">
                            {room.roomName ?? room.roomId}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-ink-3">
                          {s.online
                            ? s.occupancy
                            : s.reported
                              ? `Offline · last seen ${ageLabel(s.ageSeconds)}`
                              : 'Never reported'}
                        </span>
                      </div>
                      {s.openAlerts > 0 && (
                        <Badge tone={s.hasCritical ? 'danger' : 'warn'}>
                          {s.openAlerts} alert{s.openAlerts === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </div>
                    {s.online && (
                      <div className="mt-3 flex gap-4 text-xs font-semibold text-ink-2 [font-variant-numeric:tabular-nums]">
                        <span>{s.temperature === undefined ? '—' : `${s.temperature} °C`}</span>
                        <span>{s.power === undefined ? '—' : `${s.power} W`}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
