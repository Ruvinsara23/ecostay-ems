import type { RoomLatest } from '@/rooms/room-data-source';
import { OFFLINE_ALERT_MS } from './alerts';

export type AutomationLogEntry = {
  roomId: string;
  action: 'vacancy-cutoff';
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
  /** Writes lights=false, exhaustFan=false. NEVER mainRelay (ADR-0003). */
  writeCutoffCommands(propertyId: string, roomId: string): Promise<void>;
  appendAutomationLog(propertyId: string, entry: AutomationLogEntry): Promise<void>;
};

export type AutomationReport = { cutoffs: number; transitions: number };

/**
 * Vacancy Cutoff with transition-epoch precedence (grilled decision, CONTEXT.md):
 * the cutoff fires only AT an observed transition into VACANT_CONFIRMED — any
 * manual command issued afterwards stands untouched until the next transition.
 * Frozen (stale) data never advances the state machine: a dead device cannot
 * generate transitions. First-ever observation records state without guessing
 * a transition from null.
 */
export async function runAutomation(
  deps: AutomationDeps,
  nowMs: number,
): Promise<AutomationReport> {
  const report: AutomationReport = { cutoffs: 0, transitions: 0 };

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
      if (state === 'VACANT_CONFIRMED' && (await deps.isAutomationEnabled(propertyId, roomId))) {
        await deps.writeCutoffCommands(propertyId, roomId);
        await deps.appendAutomationLog(propertyId, {
          roomId,
          action: 'vacancy-cutoff',
          relays: ['lights', 'exhaustFan'],
          fromState: lastState,
          toState: state,
          at: nowMs,
        });
        report.cutoffs += 1;
      }
    }

    await deps.setLastOccupancyState(propertyId, roomId, state);
  }

  return report;
}
