'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import type { AlertView } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';
import { Badge } from '@/ui/badge';

const TYPE_LABELS: Record<AlertView['type'], string> = {
  'device-offline': 'Device offline',
  gas: 'Gas',
  temperature: 'Temperature',
  'water-level': 'Water level',
  'ac-left-on': 'AC Left On',
};

function valueLabel(alert: AlertView): string {
  switch (alert.type) {
    case 'gas':
      return `${alert.value} ppm`;
    case 'temperature':
      return `${alert.value} °C`;
    case 'water-level':
      return `${alert.value} %`;
    case 'ac-left-on':
      return `${alert.value} W`;
    case 'device-offline':
      return `silent ${alert.value} s`;
  }
}

function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function SeverityChip({ severity }: { severity: AlertView['severity'] }) {
  return (
    <Badge tone={severity === 'critical' ? 'danger' : 'warn'}>
      {severity === 'critical' ? 'Critical' : 'Warning'}
    </Badge>
  );
}

/** Property-level alert center: open alerts with acknowledge, resolved history below. */
export function AlertCenter({ propertyId }: { propertyId: string }) {
  const source = useRoomDataSource();
  const { sessionState } = useAuth();
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedFailed, setFeedFailed] = useState(false);

  useEffect(() => {
    return source.subscribeAlerts(
      propertyId,
      (next) => {
        setFeedFailed(false); // live data clears a previous failure
        setAlerts(next);
      },
      () => setFeedFailed(true),
    );
  }, [source, propertyId]);

  const open = alerts
    .filter((alert) => alert.resolvedAt === undefined)
    .sort((a, b) => b.startedAt - a.startedAt);
  const resolved = alerts
    .filter((alert) => alert.resolvedAt !== undefined)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
    .slice(0, 10);

  async function acknowledge(alertId: string) {
    if (sessionState.status !== 'signed-in') return;
    setError(null);
    try {
      await source.acknowledgeAlert(propertyId, alertId, sessionState.session.uid);
    } catch {
      setError('Could not acknowledge the alert — try again.');
    }
  }

  return (
    <section aria-label="Alerts" className="glass rounded-2xl p-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Alerts</h3>

      {feedFailed ? (
        <p role="alert" className="py-3 text-center text-sm font-semibold text-alarm">
          Couldn&apos;t load alerts — check your connection. Alerts may be missing.
        </p>
      ) : (
        alerts.length === 0 && (
          <p className="py-3 text-center text-sm text-ink-2">No alerts — all quiet.</p>
        )
      )}

      {open.length > 0 && (
        <ul aria-label="Open alerts" className="grid gap-2">
          {open.map((alert) => (
            <li
              key={alert.id}
              className="glass-lite flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
            >
              <div className="text-sm">
                <span className="font-semibold text-ink">{TYPE_LABELS[alert.type]}</span>{' '}
                <SeverityChip severity={alert.severity} />
                <span className="block text-xs text-ink-2 [font-variant-numeric:tabular-nums]">
                  {valueLabel(alert)} · {alert.roomId} · started {timeLabel(alert.startedAt)}
                </span>
              </div>
              {alert.acknowledgedBy ? (
                <span className="text-xs font-semibold text-ink-3">Acknowledged</span>
              ) : (
                <button
                  type="button"
                  onClick={() => acknowledge(alert.id)}
                  className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-md transition-colors hover:bg-brand-deep"
                >
                  Acknowledge
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <>
          <h4 className="mt-3 mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
            Resolved
          </h4>
          <ul aria-label="Resolved alerts" className="grid gap-1">
            {resolved.map((alert) => (
              <li
                key={alert.id}
                className="text-xs text-ink-3 [font-variant-numeric:tabular-nums]"
              >
                <span className="font-semibold text-ink-2">{TYPE_LABELS[alert.type]}</span> ·{' '}
                {valueLabel(alert)} · {alert.roomId} · {timeLabel(alert.startedAt)}–
                {timeLabel(alert.resolvedAt ?? alert.startedAt)}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-alarm">
          {error}
        </p>
      )}
    </section>
  );
}
