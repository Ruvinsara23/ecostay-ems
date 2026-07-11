import type { AlertThresholds } from '@/alerts/thresholds';
import type { Session } from '@/auth/auth-gateway';
import type { DeviceCommandKey, DeviceCommands, RoomTelemetry } from '@/telemetry/contract';

export type { AlertThresholds } from '@/alerts/thresholds';

/** One room an authenticated user may see, with display names when set (Admin metadata). */
export type RoomRef = {
  propertyId: string;
  roomId: string;
  propertyName?: string;
  roomName?: string;
};

/**
 * A room's `latest` snapshot as it actually arrives from RTDB: the firmware
 * writes every field, but the database is untyped at runtime, so consumers
 * must tolerate any single field being absent (PRD: one bad field must never
 * blank the view). `null` means the room has never reported at all.
 */
export type RoomLatest = Partial<RoomTelemetry>;

/**
 * The RTDB read seam (PRD "Implementation Decisions"). UI code depends on this
 * port only — never on the Firebase SDK directly.
 */
export interface RoomDataSource {
  /**
   * The rooms this session may see (tenancy, ADR-0005): owners get the rooms of
   * their member properties (via the users/{uid}/properties index); admins get
   * every property's rooms. Client-side courtesy — RTDB rules are the boundary.
   */
  listAccessibleRooms(session: Session): Promise<RoomRef[]>;

  /**
   * Reports the room's current `latest` (or null if never reported)
   * immediately-or-soon, then again on every firmware write.
   * Returns an unsubscribe function.
   */
  subscribeLatest(
    propertyId: string,
    roomId: string,
    callback: (latest: RoomLatest | null) => void,
    onError?: () => void,
  ): () => void;

  /**
   * Milliseconds to ADD to the local clock to get server time (RTDB
   * `.info/serverTimeOffset`). Freshness must be judged on the corrected clock —
   * a real ~25-min dev-machine skew was measured in the field (issue 04).
   */
  subscribeServerTimeOffset(callback: (offsetMs: number) => void): () => void;

  /**
   * The room's commanded state (`devices/*` booleans), immediately-then-on-change.
   * This is what the device has been TOLD — only the presence relay's actual state
   * is ever known (telemetry `relayStatus`).
   */
  subscribeDeviceCommands(
    propertyId: string,
    roomId: string,
    callback: (commands: DeviceCommands) => void,
  ): () => void;

  /**
   * Write one command boolean. Plain leaf write, no ack (firmware contract);
   * rejects on rules denial or network failure. RISK GATE #3: flips real relays.
   */
  setDeviceCommand(
    propertyId: string,
    roomId: string,
    key: DeviceCommandKey,
    on: boolean,
  ): Promise<void>;

  /**
   * The room's vacancy-cutoff automation toggle (settings/automationEnabled).
   * A server setting, not a device command — usable regardless of freshness;
   * absent means OFF.
   */
  subscribeAutomationEnabled(
    propertyId: string,
    roomId: string,
    callback: (enabled: boolean) => void,
  ): () => void;

  setAutomationEnabled(propertyId: string, roomId: string, enabled: boolean): Promise<void>;

  /** 5-min samples recorded by the server sampler (ADR-0010), from sinceMs onward, live. */
  subscribeEnergyHistory(
    propertyId: string,
    roomId: string,
    sinceMs: number,
    callback: (samples: EnergyHistorySample[]) => void,
    onError?: () => void,
  ): () => void;

  /** Nightly per-day aggregates for the room, keyed 'yyyy-mm-dd' (Colombo dates), live. */
  subscribeDailyAggregates(
    propertyId: string,
    roomId: string,
    callback: (byDate: Record<string, DailyAggregateView>) => void,
    onError?: () => void,
  ): () => void;

  /** The property's CEB tariff category (e.g. 'H-1'), null until set; live. */
  subscribeTariffCategory(
    propertyId: string,
    callback: (category: string | null) => void,
  ): () => void;

  /** Set the property's CEB tariff category (admin only; rules enforce). */
  setTariffCategory(propertyId: string, category: string): Promise<void>;

  /** The property's controlled-circuit rated wattages, null until set; live. */
  subscribeCircuitWattages(
    propertyId: string,
    callback: (wattages: CircuitWattages | null) => void,
  ): () => void;

  /** Set the property's circuit wattages (admin only; rules enforce). */
  setCircuitWattages(propertyId: string, wattages: CircuitWattages): Promise<void>;

  /** The property's alert thresholds, null until set; live. */
  subscribeAlertThresholds(
    propertyId: string,
    callback: (thresholds: AlertThresholds | null) => void,
  ): () => void;

  /** Set the property's alert thresholds (admin only; rules enforce). */
  setAlertThresholds(propertyId: string, thresholds: AlertThresholds): Promise<void>;

  /** The property's alert records (open and resolved), live. */
  subscribeAlerts(
    propertyId: string,
    callback: (alerts: AlertView[]) => void,
    onError?: () => void,
  ): () => void;

  /**
   * Acknowledge an open alert as the given user. Rules permit writing ONLY
   * acknowledgedBy (must equal the caller's uid) + acknowledgedAt.
   */
  acknowledgeAlert(propertyId: string, alertId: string, uid: string): Promise<void>;
}

export type EnergyHistorySample = {
  energy: number; // cumulative kWh (simulated until real PZEM — ADR-0003 labeling applies)
  power: number; // W
  occupancyState?: RoomTelemetry['occupancyState'];
  sampledAt: number;
};

export type DailyAggregateView = {
  kWhUsed: number;
  kWhUsedPeak?: number;
  kWhUsedDay?: number;
  kWhUsedOffPeak?: number;
  costLKR: number | null;
  occupiedMinutes: number;
  avoidedKWh: number;
  avoidedKWhPeak?: number;
  avoidedKWhDay?: number;
  avoidedKWhOffPeak?: number;
};

/** A lifecycle alert record as the tick writes it (src/server/alerts.ts), plus its id. */
export type CircuitWattages = { lights: number; exhaustFan: number };

export type AlertView = {
  id: string;
  roomId: string;
  type: 'device-offline' | 'gas' | 'temperature' | 'water-level' | 'ac-left-on';
  severity: 'critical' | 'warning';
  value: number;
  startedAt: number;
  resolvedAt?: number;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
};
