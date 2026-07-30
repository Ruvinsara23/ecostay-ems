import type { RoomLatest } from '@/rooms/room-data-source';
import type { OccupancyState } from '@/telemetry/contract';
import {
  COMFORT_LOAD_COMMAND_KEYS,
  comfortLoadsAllowed,
} from '@/telemetry/occupancy-policy';
import { OFFLINE_ALERT_MS } from './alerts';

export type AutomationLogEntry = {
  roomId: string;
  action: 'vacancy-cutoff' | 'comfort-load-cutoff' | 'occupancy-restore';
  relays: string[];
  fromState: string | null;
  toState: string;
  at: number;
};

export type AutomationDeps = {
  listRooms(): Promise<Array<{ propertyId: string; roomId: string }>>;
  readLatest(propertyId: string, roomId: string): Promise<RoomLatest | null>;
  /** Last occupancy state this runtime observed (ops/lastOccupancy); null on first sight. */
  getLastOccupancyState(propertyId: string, roomId: string): Promise<string | null>;
  setLastOccupancyState(propertyId: string, roomId: string, state: string): Promise<void>;
  /** properties/{pid}/rooms/{rid}/settings/automationEnabled === true; absent = OFF. */
  isAutomationEnabled(propertyId: string, roomId: string): Promise<boolean>;
  /** Writes lights, exhaust fan, and AC false. NEVER mainRelay (ADR-0003). */
  writeCutoffCommands(propertyId: string, roomId: string): Promise<void>;
  /** Writes lights, exhaust fan, and AC true after sensor-confirmed return. */
  writeRestoreCommands(propertyId: string, roomId: string): Promise<void>;
  appendAutomationLog(propertyId: string, entry: AutomationLogEntry): Promise<void>;
};

export type AutomationReport = { cutoffs: number; restores: number; transitions: number };

const RESTORE_SOURCE_STATES = new Set(['VACANT', 'VACANT_CONFIRMED', 'ENTRY_DETECTED']);
function shouldRestoreComfortLoads(fromState: string, toState: OccupancyState): boolean {
  return RESTORE_SOURCE_STATES.has(fromState) && comfortLoadsAllowed(toState);
}

/**
 * Comfort Load Automation restores circuits only when a vacancy/entry
 * candidate advances to OCCUPIED_ACTIVE or OCCUPIED_IDLE. Sleeping is a local
 * physical suspension that retains command intent for immediate wake-up.
 * EXIT_PENDING also retains intent because the guest may remain or return;
 * VACANT_CONFIRMED is the point that clears commands.
 * Door-open ENTRY_DETECTED alone never restores comfort loads.
 *
 * Server actions require settings/automationEnabled and use transition-epoch
 * precedence. Frozen telemetry cannot generate transitions, and a first-ever
 * observation records state without inventing one. The firmware independently
 * blocks disallowed physical outputs and may clear its own command leaves to
 * false under the scoped RTDB rule.
 */
export async function runAutomation(
  deps: AutomationDeps,
  nowMs: number,
): Promise<AutomationReport> {
  const report: AutomationReport = { cutoffs: 0, restores: 0, transitions: 0 };

  for (const { propertyId, roomId } of await deps.listRooms()) {
    const latest = await deps.readLatest(propertyId, roomId);
    if (latest === null || latest.occupancyState === undefined) continue;
    const silentMs =
      latest.updatedAt === undefined ? Number.POSITIVE_INFINITY : nowMs - latest.updatedAt;
    if (silentMs > OFFLINE_ALERT_MS) continue; // frozen data proves nothing

    const state = latest.occupancyState;
    const lastState = await deps.getLastOccupancyState(propertyId, roomId);
    if (state === lastState) continue;

    if (lastState !== null) {
      report.transitions += 1;
      const enabled = await deps.isAutomationEnabled(propertyId, roomId);

      if (enabled && state === 'VACANT_CONFIRMED') {
        await deps.writeCutoffCommands(propertyId, roomId);
        await deps.appendAutomationLog(propertyId, {
          roomId,
          action: 'vacancy-cutoff',
          relays: [...COMFORT_LOAD_COMMAND_KEYS],
          fromState: lastState,
          toState: state,
          at: nowMs,
        });
        report.cutoffs += 1;
      } else if (enabled && shouldRestoreComfortLoads(lastState, state)) {
        // A door-open candidate is not enough. Restore only after the firmware
        // reports a sensor-confirmed occupied state.
        await deps.writeRestoreCommands(propertyId, roomId);
        await deps.appendAutomationLog(propertyId, {
          roomId,
          action: 'occupancy-restore',
          relays: [...COMFORT_LOAD_COMMAND_KEYS],
          fromState: lastState,
          toState: state,
          at: nowMs,
        });
        report.restores += 1;
      }
    }

    await deps.setLastOccupancyState(propertyId, roomId, state);
  }

  return report;
}
