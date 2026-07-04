'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import type { AlertView } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';

const TYPE_LABELS: Record<AlertView['type'], string> = {
  'device-offline': 'Device offline',
  gas: 'Gas',
  temperature: 'Temperature',
  'water-level': 'Water level',
};

function valueLabel(alert: AlertView): string {
  switch (alert.type) {
    case 'gas':
      return `${alert.value} ppm`;
    case 'temperature':
      return `${alert.value} °C`;
    case 'water-level':
      return `${alert.value} %`;
    case 'device-offline':
      return `silent ${alert.value} s`;
  }
}

function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function SeverityChip({ severity }: { severity: AlertView['severity'] }) {
  return severity === 'critical' ? (
    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950 dark:text-red-300">
      Critical
    </span>
  ) : (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900 dark:text-amber-200">
      Warning
    </span>
  );
}

/** Property-level alert center: open alerts with acknowledge, resolved history below. */
export function AlertCenter({ propertyId }: { propertyId: string }) {
  const source = useRoomDataSource();
  const { sessionState } = useAuth();
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return source.subscribeAlerts(propertyId, setAlerts);
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
    <section
      aria-label="Alerts"
      className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Alerts</h3>

      {alerts.length === 0 && (
        <p className="py-3 text-center text-sm text-zinc-500">No alerts — all quiet.</p>
      )}

      {open.length > 0 && (
        <ul aria-label="Open alerts" className="grid gap-2">
          {open.map((alert) => (
            <li
              key={alert.id}
              className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900"
            >
              <div className="text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {TYPE_LABELS[alert.type]}
                </span>{' '}
                <SeverityChip severity={alert.severity} />
                <span className="block text-xs text-zinc-500">
                  {valueLabel(alert)} · {alert.roomId} · started {timeLabel(alert.startedAt)}
                </span>
              </div>
              {alert.acknowledgedBy ? (
                <span className="text-xs font-medium text-zinc-500">Acknowledged</span>
              ) : (
                <button
                  type="button"
                  onClick={() => acknowledge(alert.id)}
                  className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
          <h4 className="mt-3 mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Resolved
          </h4>
          <ul aria-label="Resolved alerts" className="grid gap-1">
            {resolved.map((alert) => (
              <li key={alert.id} className="text-xs text-zinc-500">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">
                  {TYPE_LABELS[alert.type]}
                </span>{' '}
                · {valueLabel(alert)} · {alert.roomId} · {timeLabel(alert.startedAt)}–
                {timeLabel(alert.resolvedAt ?? alert.startedAt)}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
