import type { RoomLatest } from '@/rooms/room-data-source';
import { GAS_ALARM_THRESHOLD } from '@/telemetry/contract';

export const ALERT_TYPES = ['device-offline', 'gas', 'temperature', 'water-level'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Defaults become Admin-editable settings in the Admin UI phase (CONTEXT.md). */
export const OFFLINE_ALERT_MS = 90_000;
export const TEMPERATURE_ALERT_THRESHOLD_C = 33;
export const WATER_LEVEL_ALERT_THRESHOLD_PCT = 20;

export type AlertSeverity = 'critical' | 'warning';

export type AlertRecord = {
  roomId: string;
  type: AlertType;
  severity: AlertSeverity;
  value: number;
  startedAt: number;
  resolvedAt?: number;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
};

export type AlertsDeps = {
  listRooms(): Promise<Array<{ propertyId: string; roomId: string }>>;
  readLatest(propertyId: string, roomId: string): Promise<RoomLatest | null>;
  /** Open-alert index for the room: type → alertId (ops/openAlerts). */
  getOpenAlerts(
    propertyId: string,
    roomId: string,
  ): Promise<Partial<Record<AlertType, string>>>;
  openAlert(propertyId: string, roomId: string, alert: AlertRecord): Promise<void>;
  resolveAlert(
    propertyId: string,
    roomId: string,
    type: AlertType,
    alertId: string,
    resolvedAt: number,
  ): Promise<void>;
};

export type AlertsReport = { opened: number; resolved: number; open: number };

const SEVERITY: Record<AlertType, AlertSeverity> = {
  'device-offline': 'warning',
  gas: 'critical',
  temperature: 'warning',
  'water-level': 'warning',
};

/**
 * The 1-minute alert evaluator (ADR-0006 workloads #3+#4, ADR-0010 runtime).
 * One open alert per (room, type); auto-resolve when clear. Threshold conditions
 * are judged ONLY on fresh data — a dead device's frozen values prove nothing,
 * so its threshold alerts resolve and `device-offline` carries the situation.
 * Never-reported rooms raise nothing.
 */
export async function evaluateAlerts(deps: AlertsDeps, nowMs: number): Promise<AlertsReport> {
  const report: AlertsReport = { opened: 0, resolved: 0, open: 0 };

  for (const { propertyId, roomId } of await deps.listRooms()) {
    const latest = await deps.readLatest(propertyId, roomId);
    if (latest === null) continue;

    const silentMs =
      latest.updatedAt === undefined ? Number.POSITIVE_INFINITY : nowMs - latest.updatedAt;
    const isFresh = silentMs <= OFFLINE_ALERT_MS;

    const conditions: Record<AlertType, { active: boolean; value: number }> = {
      'device-offline': {
        active: !isFresh,
        value: Number.isFinite(silentMs) ? Math.floor(silentMs / 1000) : 0,
      },
      gas: {
        active: isFresh && latest.gas !== undefined && latest.gas > GAS_ALARM_THRESHOLD,
        value: latest.gas ?? 0,
      },
      temperature: {
        active:
          isFresh &&
          latest.temperature !== undefined &&
          latest.temperature > TEMPERATURE_ALERT_THRESHOLD_C,
        value: latest.temperature ?? 0,
      },
      'water-level': {
        active:
          isFresh &&
          latest.waterLevel !== undefined &&
          latest.waterLevel < WATER_LEVEL_ALERT_THRESHOLD_PCT,
        value: latest.waterLevel ?? 0,
      },
    };

    const openAlerts = await deps.getOpenAlerts(propertyId, roomId);

    for (const type of ALERT_TYPES) {
      const { active, value } = conditions[type];
      const openId = openAlerts[type];
      if (active && !openId) {
        await deps.openAlert(propertyId, roomId, {
          roomId,
          type,
          severity: SEVERITY[type],
          value,
          startedAt: nowMs,
        });
        report.opened += 1;
      } else if (!active && openId) {
        await deps.resolveAlert(propertyId, roomId, type, openId, nowMs);
        report.resolved += 1;
      } else if (active && openId) {
        report.open += 1;
      }
    }
  }

  return report;
}
