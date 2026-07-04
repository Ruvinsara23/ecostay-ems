// TypeScript mirror of the firmware↔Firebase contract (docs/firmware-contract.md).
// Field names and types are FIXED by the deployed firmware — a drift here must be a
// compile error, never a silent rename (ADR-0002, ADR-0003). Do not "improve" names.

export const OCCUPANCY_STATES = [
  'VACANT',
  'ENTRY_DETECTED',
  'OCCUPIED_ACTIVE',
  'OCCUPIED_IDLE',
  'OCCUPIED_SLEEPING',
  'EXIT_PENDING',
  'VACANT_CONFIRMED',
] as const;

export type OccupancyState = (typeof OCCUPANCY_STATES)[number];

/** `{base}/latest` — overwritten every 3 s by the firmware. Not a history. */
export type RoomTelemetry = {
  voltage: number; // ⚠ simulated until real PZEM reads (ADR-0007)
  current: number; // ⚠ simulated
  power: number; // ⚠ simulated, W
  energy: number; // ⚠ simulated, cumulative kWh (resets on reboot)
  gas: number; // 0–1000, alarm above GAS_ALARM_THRESHOLD
  pir: boolean;
  doorOpen: boolean;
  temperature: number; // °C (DHT11)
  humidity: number; // % (DHT11)
  lightLevel: number; // always 0 — no sensor fitted
  waterLevel: number; // 0–100 %
  flowRate: number; // L/min
  totalLiters: number; // session-accumulated, resets on reboot
  relayStatus: boolean; // presence relay only
  buzzerStatus: boolean;
  occupancyState: OccupancyState;
  humanPresent: boolean;
  motionDetected: boolean;
  updatedAt: number; // server timestamp (ms)
};

/** Firmware sounds the gas alarm above this value (docs/firmware-contract.md). */
export const GAS_ALARM_THRESHOLD = 300;
